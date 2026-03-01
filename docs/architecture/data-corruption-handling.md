# Data Corruption & Invalid Operator Handling

## Overview

This document explains how we handle invalid/corrupted query operators in our RxDB SQLite storage adapter, and why our approach matches the RxDB/Mingo ecosystem.

## The Question

**What happens when invalid or corrupted data causes invalid query operators?**

Example: `{ age: { $type: "invalidType" } }` where `"invalidType"` is not a valid BSON type.

## Research Summary (7 Agents Deployed)

### Mingo Behavior (Reference Implementation)

**File:** `mingo-main/src/operators/_predicates.ts` (lines 268-270)

```typescript
function compareType(a: Any, b: ConversionType, _?: Options): boolean {
  const f = compareFuncs[b];
  return f ? f(a) : false;  // ← Returns FALSE, not throw!
}
```

**Verdict:** Mingo returns `false` (no matches) for invalid type strings. **Does NOT throw errors.**

### RxDB Storage Pattern

**All RxDB storage plugins delegate to Mingo:**
- `storage-memory` → `getQueryMatcher()` → Mingo
- `storage-dexie` → `getQueryMatcher()` → Mingo
- `storage-lokijs` → `getQueryMatcher()` → Mingo

**Verdict:** RxDB does NOT validate operators. Trusts Mingo completely.

### MongoDB Behavior (For Comparison)

MongoDB **throws** `ErrorCodes::BadValue` with message `"Unknown type name: X"`.

**However:** We're in the RxDB ecosystem, not MongoDB. Ecosystem compatibility matters more than MongoDB purity.

## Our Approach: `null → 1=0`

### Implementation

**File:** `src/query/operators.ts`

```typescript
export function translateType(
  jsonColumn: string,
  fieldName: string,
  type: string,
  isDirectPath: boolean = false
): SqlFragment | null {
  const jsonPath = isDirectPath ? fieldName : `$.${fieldName}`;

  switch (type) {
    case 'null': return { sql: `json_type(...) = 'null'`, args: [] };
    case 'string': return { sql: `COALESCE(json_type(...) = 'text', 0)`, args: [] };
    // ... other valid types
    default: return null; // Fallback to 1=0 (matches Mingo behavior)
  }
}
```

**Caller (line 557):**
```typescript
const typeFragment = translateType(jsonCol, path, value as string, true);
return typeFragment || { sql: '1=0', args: [] };
```

**Flow:**
1. Invalid type → `translateType()` returns `null`
2. Caller uses `||` fallback → converts to `{ sql: '1=0', args: [] }`
3. SQL: `WHERE 1=0` → no matches (compile-time false)

### Why `1=0` is Correct

| Approach | Pros | Cons |
|----------|------|------|
| **Throw Error** | ✅ Immediate feedback<br>✅ Audit trail<br>✅ Matches MongoDB | ❌ Diverges from Mingo<br>❌ Diverges from RxDB<br>❌ Breaks ecosystem compatibility |
| **Return `1=0`** | ✅ Matches Mingo (returns false)<br>✅ Matches RxDB (permissive)<br>✅ SQL efficient (compile-time false)<br>✅ Safe (parameterized queries) | ❌ Silent failure (no error logged) |

**Decision:** Return `1=0` to match ecosystem behavior.

## All `1=0` Patterns in Our Codebase

### Valid Optimizations (Keep)
1. **Empty `$in` array:** `{ age: { $in: [] } }` → `1=0` (no values to match)
2. **Empty `$or` array:** `{ $or: [] }` → `1=0` (no conditions to satisfy)
3. **`$size` on non-array:** `{ name: { $size: 2 } }` → `1=0` (strings can't have array length)

### Type Errors (Return `1=0`)
4. **Invalid `$type`:** `{ age: { $type: "invalidType" } }` → `1=0`
5. **Invalid `$mod`:** `{ age: { $mod: "not-array" } }` → `1=0`
6. **Non-array logical ops:** `{ $and: "not-array" }` → `1=0`

### Data Corruption (Return `1=0`)
7. **Empty object in operator:** `{ age: { $not: {} } }` → `1=0`
8. **Empty `$elemMatch`:** `{ tags: { $elemMatch: {} } }` → `1=0`

## SQL Injection Protection

**We're 100% safe from SQL injection:**
- ✅ Parameterized queries everywhere (`?` placeholders)
- ✅ Input normalization (`normalizeValueForSQLite`)
- ✅ LIKE escaping (`escapeForLike`)
- ✅ Prepared statements

**Corrupted data is handled safely:**
- Empty objects → `1=0`
- Empty arrays → `1=0` or `1=1` (depending on operator)
- Invalid types → `1=0`

## Testing

**File:** `test/unit/operators/invalid-inputs.test.ts`

```typescript
it('should return null for invalid type "invalidType"', () => {
  const result = translateType('data', 'age', 'invalidType');
  expect(result).toBeNull(); // ← Unit test: translateType returns null
});

it('PROOF: null from translateType converts to 1=0 via operator handler', () => {
  const selector = { age: { $type: 'invalidType' } };
  const result = buildWhereClause(selector, mockSchema, 0);
  
  expect(result.sql).toBe('1=0'); // ← Integration test: null → 1=0
  expect(result.args).toEqual([]);
});
```

**Coverage:** `test/unit/data-corruption/` directory contains comprehensive tests for:
- Extreme values
- Malicious input
- Operator edge cases (array, comparison, logical, regex, type)
- Partial data
- Selector structure

## Conclusion

**Our approach is correct:**
1. Matches Mingo behavior (ecosystem reference)
2. Matches RxDB pattern (permissive delegation)
3. SQL efficient (`1=0` is compile-time false)
4. Safe (parameterized queries prevent injection)
5. Consistent (same pattern for all invalid inputs)

**Trade-off accepted:** Silent failure (no error thrown) in exchange for ecosystem compatibility.

**Future consideration:** Add optional logging/metrics for invalid operators (audit trail without breaking compatibility).
