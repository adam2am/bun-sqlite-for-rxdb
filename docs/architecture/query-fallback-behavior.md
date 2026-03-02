# Query Fallback Behavior: SQL vs Mingo

## Overview

This document explains when the SQLite storage adapter falls back to Mingo (JavaScript query engine) vs staying in native SQL, and the architectural reasoning behind these decisions.

## The Core Trade-off

**Goal:** Maximize query performance by using native SQLite whenever possible.

**Constraint:** Must guarantee 100% MongoDB query semantics compatibility.

**Solution:** Fall back to Mingo when SQL cannot guarantee correctness.

---

## When We Fall Back to Mingo (Return `null`)

### 1. Dot-Notation with Unknown Types

**Location:** `src/query/builder.ts` line 144

```typescript
if (columnInfo.type === 'array' || columnInfo.type === 'unknown') {
    return null;  // Fall back to Mingo
}
```

**Why:** MongoDB does implicit array traversal at ANY level of a dot-notation path. SQLite's `json_extract()` only works for direct object paths.

**Example of Silent Data Loss (The Bug We Fixed):**

```json
{
    "metadata": {
        "user": [
            { "profile": { "name": "Alice" } },
            { "profile": { "name": "Bob" } }
        ]
    }
}
```

- **Query:** `{ 'metadata.user.profile.name': 'Alice' }`
- **MongoDB:** ✅ MATCHES (implicit array traversal)
- **SQLite:** `json_extract(data, '$.metadata.user.profile.name')` → Returns `null` → ❌ NO MATCH
- **Result:** Silent data loss!

**The Fix:** When ANY segment of a dot-notation path is `unknown` (could be an array at runtime), fall back to Mingo.

**Affects:** ALL operators on paths like `'metadata.user.profile.name'` when any segment is unknown.

---

### 2. Plain Object Equality

**Location:** `src/query/operators.ts` line 58

```typescript
if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp)) {
    return null;  // Fall back to Mingo
}
```

**Why:** SQLite's `json()` function preserves key order, but MongoDB treats objects as key-order independent.

**Example:**

```javascript
// These are EQUAL in MongoDB, but NOT in SQLite
{ a: 1, b: 2 } === { b: 2, a: 1 }  // MongoDB: true, SQLite: false
```

**Affects:** `{ field: { nested: 'object' } }` queries.

**Rationale:**
- **Correctness:** Mingo handles key-order independence correctly
- **Performance:** Keeps writes fast (native `JSON.stringify`)
- **Guidance:** Encourages users to use dot-notation (`field.nested`) instead

---

### 3. Complex Regex Patterns

**Location:** `src/query/operators.ts` line 428

```typescript
const smartResult = smartRegexToLike(field, pattern, options, schema, fieldName);
if (smartResult) return smartResult;
return null;  // Fall back to Mingo
```

**Why:** SQLite's `LIKE` operator can only handle simple patterns. Complex regex requires JavaScript execution.

**Affects:** `{ field: { $regex: /complex|pattern/i } }` when pattern cannot be converted to `LIKE`.

---

## When We Stay in SQL

### Fast Path (No Type Guards)

- **Simple field equality:** `{ name: 'Alice' }`
- **Comparison operators:** `{ age: { $gt: 25 } }`
- **$in, $nin:** `{ name: { $in: ['Alice', 'Bob'] } }`
- **$exists:** `{ name: { $exists: true } }`
- **$size on known arrays:** `{ tags: { $size: 3 } }`
- **Array equality:** `{ tags: ['a', 'b'] }`
- **$elemMatch on known arrays:** `{ tags: { $elemMatch: { $eq: 'test' } } }`

### Hybrid Path (SQL with Runtime Guards)

- **$size on unknown fields:** Adds `json_type()` check before `json_array_length()`
- **Comparison operators:** Adds BSON type guards to prevent SQLite's implicit type conversion

---

## The "Why Not Native SQL for Everything?" Question

**Junior Dev Question:** "Couldn't we just add native SQLite support for implicit array traversal instead of falling back to Mingo?"

**Answer:** YES, we COULD. But we DON'T because:

### 1. Complexity Explosion

**Current code (our fix):**
```typescript
if (columnInfo.type === 'array' || columnInfo.type === 'unknown') {
    return null;  // 1 line, simple, correct
}
```

**Native SQL approach would require:**
```typescript
// Need to:
// - Detect which segments are unknown
// - Generate nested EXISTS for each
// - Handle combinations (array + object + unknown)
// - Handle array indices in paths
// - Handle $elemMatch inside dot-notation
// - Test all edge cases
// = 200+ lines of complex SQL generation logic
```

**Linus Rule:** Complexity is the enemy. More code = more bugs.

---

### 2. Premature Optimization

We have **ZERO data** showing Mingo fallback is a bottleneck.

**The Right Process:**
1. ✅ Ship the simple, correct solution (we're here)
2. 📊 Profile in production
3. 🚀 IF it's slow, THEN optimize

**Wrong Process:**
1. ~~Assume it's slow~~
2. ~~Write complex code~~
3. ~~Discover it's not actually faster~~
4. ~~Now stuck maintaining complex code~~

---

### 3. Performance is Uncertain

Nested `jsonb_each` might be **SLOWER** than Mingo for:
- Deep paths (4+ segments)
- Multiple unknown segments
- Large arrays

SQLite has to:
- Parse JSON at each level
- Create temporary tables for each `jsonb_each`
- Join them together

Mingo just:
- Parses JSON once
- Walks the object tree in memory

**We don't know which is faster without profiling.**

---

### 4. The REAL Solution

If users care about performance, they should **DEFINE THEIR SCHEMAS PROPERLY**:

```typescript
// BAD (causes Mingo fallback):
properties: {
    metadata: { type: 'object' }  // Vague, no nested definition
}

// GOOD (enables fast SQL):
properties: {
    metadata: {
        type: 'object',
        properties: {
            user: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        profile: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' }
                            }
                        }
                    }
                }
            }
        }
    }
}
```

With proper schema, we generate optimal SQL:
```sql
EXISTS (
  SELECT 1 FROM jsonb_each(data, '$.metadata.user')
  WHERE json_extract(value, '$.profile.name') = 'Alice'
)
```

**No unknown types = No fallback = Fast SQL.**

---

## Schema Composition & Type Reuse

### Can Users Define Types Externally?

**YES**, using JSON Schema's `$defs` and `$ref`:

```javascript
{
  "$defs": {
    "metadata": {
      "type": "object",
      "properties": {
        "createdAt": { "type": "number" },
        "updatedAt": { "type": "number" }
      }
    }
  },
  "properties": {
    "userMetadata": { "$ref": "#/$defs/metadata" },
    "systemMetadata": { "$ref": "#/$defs/metadata" }
  }
}
```

### RxDB's Constraints

**Top-level fields MUST be fully defined** because RxDB needs them for:
- TypeScript type generation
- Query optimization
- ORM method generation
- Validation

**BUT** — for nested fields, you CAN use:
```javascript
{
  "myDynamicData": {
    "type": "object"
    // No properties defined = accepts any JSON
  }
}
```

This is the **industry-standard escape hatch** for storing arbitrary nested data.

---

## Industry Comparison

| Feature | MongoDB/CouchDB | RxDB | Our SQLite Adapter |
|---------|-----------------|------|-------------------|
| Vague nested schemas | ✅ Allowed | ⚠️ Allowed but discouraged | ⚠️ Falls back to Mingo |
| Schema composition | ✅ Full support | ✅ Via JSON Schema | ✅ Via JSON Schema |
| Implicit array traversal | ✅ Native | ✅ Via Mingo | ⚠️ Mingo fallback for unknown types |
| Key-order independence | ✅ Native | ✅ Via Mingo | ⚠️ Mingo fallback for objects |

**Our approach (forcing detailed schemas) is NOT industry standard — it's a RxDB/Mingo limitation.**

---

## When Would We Implement Native SQL Support?

**IF** profiling shows Mingo fallback is a bottleneck, THEN:

1. Add config option: `{ aggressiveSqlOptimization: true }`
2. Implement incrementally (start with single unknown segment)
3. Measure performance impact
4. Document trade-offs (complexity vs speed)
5. Let users opt-in

---

## Decision Matrix

| Approach | Correctness | Simplicity | Performance | Maintainability |
|----------|-------------|------------|-------------|-----------------|
| **Current (Mingo fallback)** | ✅ Perfect | ✅ 1 line | ⚠️ Unknown | ✅ Easy |
| **Native SQL generation** | ✅ Perfect | ❌ 200+ lines | ⚠️ Unknown | ❌ Hard |

**Our choice:** Correctness + Simplicity > Uncertain Performance

---

## Testing

See `test/unit/fallback-behavior-matrix.test.ts` for comprehensive examples of:
- ✅ Queries that stay in SQL (Fast Path)
- ❌ Queries that fall back to Mingo (Correctness Over Performance)
- 📊 Hybrid queries (SQL with Runtime Guards)
- 🚫 Queries rejected in SQL (Returns 1=0)

See `test/debug-proof-silent-data-loss.ts` for concrete proof of the silent data loss bug.

---

## Summary

**This is NOT a bandaid. This is pragmatic engineering.**

- **Not now** (no data showing it's needed)
- **Maybe later** (if profiling shows bottleneck)
- **Real solution** (users should define schemas properly)

**ARRR! Clean architecture. No bandaids. Ship it! 🏴‍☠️**
