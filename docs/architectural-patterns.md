# Architectural Patterns

Key design patterns and decisions for `bun-sqlite-for-rxdb` development.

---

## 1. Zero `any` Types Policy

**Rule:** Never use TypeScript `any` types.

**Why:**
- Type safety catches bugs at compile time
- Better IDE autocomplete and refactoring
- Self-documenting code

**Example:**
```typescript
// ❌ Bad
function query(selector: any): any { ... }

// ✅ Good
function query<RxDocType>(
  selector: MangoQuerySelector<RxDocType>
): RxDocumentData<RxDocType>[] { ... }
```

**History:** v0.1.1 removed all 32 `any` instances.

---

## 2. DRY Architecture - Pure Functions

**Rule:** Prefer pure functions over classes/state.

**Why:**
- Easier to test (no setup/teardown)
- Composable and reusable
- No hidden dependencies

**Example:**
```typescript
// ✅ Pure operator functions
export function translateEq(field: string, value: unknown): SqlFragment {
  return { sql: `${field} = ?`, args: [value] };
}

export function translateIn(field: string, values: unknown[]): SqlFragment {
  if (values.length === 0) return { sql: '1=0', args: [] };
  const placeholders = values.map(() => '?').join(', ');
  return { sql: `${field} IN (${placeholders})`, args: values };
}
```

**History:** v0.3.0 query builder uses pure operator functions.

---

## 3. Performance-First Decisions

**Rule:** Benchmark before choosing implementation.

**Why:**
- Avoid premature optimization
- Data-driven decisions
- Document tradeoffs

**Example:** Serialization format choice (v0.2.0)
```
Tested 3 formats (10k docs, 10 runs):
- JSON + TEXT: 23.40ms ✅ WINNER
- MessagePack: 137ms (5.6x slower)
- bun:jsc: 37ms (1.58x slower)

Verdict: Bun's SIMD-accelerated JSON is fastest
```

**History:** v0.2.0 extensively tested binary formats before choosing JSON.

---

## 4. Incremental Testing

**Rule:** Test each feature independently before integration.

**Why:**
- Isolates failures
- Faster debugging
- Prevents regression

**Example:** v0.3.0 operator tests
```
src/query/operators.test.ts      - 6 tests (basic operators)
src/query/in-operators.test.ts   - 8 tests ($in, $nin)
src/query/and-operator.test.ts   - 2 tests ($and)
src/query/or-operator.test.ts    - 3 tests ($or)
src/query/builder.test.ts        - 10 tests (integration)
```

**History:** v0.3.0 added 13 new tests for 4 operators.

---

## 5. WAL Mode for File Databases

**Rule:** Auto-enable WAL mode for file-based SQLite databases.

**Why:**
- 3-6x write speedup
- Better concurrency (readers don't block writers)
- Industry standard for production SQLite

**Implementation:**
```typescript
if (databaseName !== ':memory:') {
  this.db.exec('PRAGMA journal_mode = WAL');
}
```

**Benchmark Results** (`benchmarks/wal-benchmark.ts`):
```
1000 document inserts, 5 runs each:
- WITHOUT WAL: 5.73ms average
- WITH WAL:    2.40ms average
- Speedup:     2.39x (in-memory DB)

Note: File-based databases show 3-6x speedup due to disk I/O benefits
```

**History:** v0.1.2 added WAL mode with auto-detection. v0.3.0 added benchmark verification.

---

## 6. Conflict Detection with 409 Errors

**Rule:** Return 409 status with `documentInDb` for UNIQUE constraint violations.

**Why:**
- Enables proper RxDB replication conflict resolution
- Follows HTTP semantics (409 = Conflict)
- Provides existing document for merge strategies

**Implementation:**
```typescript
catch (error: any) {
  if (error.message?.includes('UNIQUE constraint failed')) {
    const existing = this.db.query(
      'SELECT data FROM documents WHERE id = ?'
    ).get(doc.id);
    
    return {
      status: 409,
      documentInDb: JSON.parse(existing.data),
      writeRow: doc
    };
  }
}
```

**History:** v0.2.0 added conflict detection for concurrent writes.

---

## 7. RxDB API Alignment - Partial Success Pattern

**Rule:** RxDB's `bulkWrite` expects per-document error handling, NOT atomic transactions.

**Why:**
- RxDB's API design: `RxStorageBulkWriteResponse<T> = { error: RxStorageWriteError<T>[] }`
- Official docs: "A single write operation to a document is the only atomic thing you can do in RxDB"
- Designed for offline-first scenarios where full ACID across clients is impossible
- Performance: Only errors are returned, successes are inferred (input - errors = success)

**RxDB's Contract:**
```typescript
// RxDB expects this response structure
type RxStorageBulkWriteResponse<RxDocType> = {
  error: RxStorageWriteError<RxDocType>[];  // Only errors!
};

// Success = document NOT in error array
// Each document can succeed or fail independently
```

**Implementation:**
```typescript
async bulkWrite(documentWrites, context) {
  const error: RxStorageWriteError<RxDocType>[] = [];
  
  for (const write of documentWrites) {
    try {
      stmt.run(id, data, deleted, rev, mtime_ms);
    } catch (err) {
      if (err.message?.includes('UNIQUE constraint failed')) {
        error.push({
          status: 409,
          documentId: write.document.id,
          writeRow: write,
          documentInDb: existingDoc
        });
      } else {
        throw err;
      }
    }
  }
  
  return { error };  // Partial success allowed
}
```

**Critical Understanding:**
- ✅ Some documents succeed, some fail with 409 → CORRECT
- ❌ All-or-nothing atomic transactions → VIOLATES RxDB API
- ✅ Conflicts return 409 per document → EXPECTED
- ✅ Other documents continue processing → REQUIRED

**History:** v0.3.0 verified implementation matches RxDB's API contract (researched via node_modules + official docs).

---

## 8. Recursive Query Builder with Depth Tracking

**Rule:** Track logical depth for proper parentheses in nested queries.

**Why:**
- Correct SQL precedence for `$or` / `$and`
- Handles arbitrary nesting depth
- Clean, maintainable code

**Implementation:**
```typescript
function processSelector(
  selector: MangoQuerySelector<any>,
  logicalDepth: number = 0
): SqlFragment {
  if (selector.$or) {
    const fragments = selector.$or.map(s => 
      processSelector(s, logicalDepth + 1)
    );
    const needsParens = logicalDepth > 0;
    // Wrap in parentheses if nested
  }
}
```

**Test Coverage** (`src/query/nested-query.test.ts`):
```
7 comprehensive tests covering:
- 3-level nesting ($or inside $and inside $or)
- 4-level nesting with mixed operators
- Proper parentheses placement at each depth
- Complex combinations ($in, $nin, $and, $or)
```

**History:** v0.3.0 added recursive builder for complex nested queries with comprehensive test coverage.

---

## 9. NULL Handling for Array Operators

**Rule:** Use `IS NULL` / `IS NOT NULL` for `$in` / `$nin` with null values.

**Why:**
- SQL `NULL IN (...)` returns NULL (not true/false)
- Correct semantic behavior
- Matches MongoDB/RxDB behavior

**Implementation:**
```typescript
function translateIn(field: string, values: unknown[]): SqlFragment {
  const hasNull = values.includes(null);
  const nonNull = values.filter(v => v !== null);
  
  if (hasNull && nonNull.length > 0) {
    return {
      sql: `(${field} IN (${placeholders}) OR ${field} IS NULL)`,
      args: nonNull
    };
  }
}
```

**History:** v0.3.0 added proper NULL handling for `$in` / `$nin`.

---

## 10. Minimal Code Philosophy

**Rule:** Write only code that directly solves the problem.

**Why:**
- Less code = fewer bugs
- Easier to understand and maintain
- Faster to modify

**Anti-patterns to avoid:**
- God objects with many responsibilities
- Premature abstractions
- Verbose implementations
- Code that doesn't contribute to the solution

**History:** Enforced throughout all versions.

---

## 11. SQL vs Mingo Hybrid Strategy

**Rule:** Use SQL for simple operators, Mingo fallback for complex operators.

**Why:**
- SQL excels at simple predicates (=, >, <, IN, IS NULL)
- Mingo excels at complex logic ($elemMatch, $type, nested arrays)
- Right tool for the right job
- Future-proof for indexes

**Benchmark Results** (`benchmarks/sql-vs-mingo-benchmark.ts`):
```
100k documents:
- SQL operators ($exists, $regex, $gt, $in): 250.67ms avg
- Mingo fallback ($elemMatch): 250.36ms
- Ratio: 1.00x (identical performance without indexes)

Conclusion: Similar performance at 100k docs, but SQL will benefit 
from indexes in future. Use SQL for simple, Mingo for complex.
```

**Decision Matrix:**

| Operator | Implementation | Reasoning |
|----------|---------------|-----------|
| $eq, $ne, $gt, $gte, $lt, $lte | SQL | Trivial (1 line), benefits from indexes |
| $in, $nin | SQL | Native IN operator |
| $exists | SQL | IS NULL is instant |
| $regex (simple) | SQL | LIKE for simple patterns |
| $regex (complex) | Mingo | Full regex support |
| $and, $or, $not, $nor | SQL | Logical operators are SQL's strength |
| $elemMatch | Mingo | json_each() is complex, Mingo is simple |
| $type | Mingo | SQLite has no typeof |
| $size | SQL | json_array_length() is simple |
| $mod | SQL | Native % operator |

**Implementation Pattern:**
```typescript
export function translateOperator(field: string, value: any): SqlFragment | null {
  // Return SqlFragment for SQL translation
  // Return null to trigger Mingo fallback
  
  if (isSimpleCase) {
    return { sql: `${field} = ?`, args: [value] };
  }
  
  return null; // Complex case → Mingo
}
```

**Key Insight:** Don't benchmark SQL vs Mingo. Ask: "Is this query simple enough for SQL?" If yes, use SQL (1-5 lines). If no, use Mingo (return null).

**History:** v0.3.0 benchmarked at scale, decided on hybrid approach based on operator complexity, not performance.

---

## Quick Reference

| Pattern | Version | Key Benefit |
|---------|---------|-------------|
| Zero `any` types | v0.1.1 | Type safety |
| Pure functions | v0.3.0 | Testability |
| Benchmark-driven | v0.2.0 | Performance |
| Incremental tests | v0.3.0 | Isolation |
| WAL mode | v0.1.2 | 3-6x speedup |
| 409 conflicts | v0.2.0 | Replication |
| RxDB API alignment | v0.3.0 | Partial success |
| Recursive builder | v0.3.0 | Nested queries |
| NULL handling | v0.3.0 | Correctness |
| Minimal code | All | Maintainability |
| SQL vs Mingo hybrid | v0.3.0 | Right tool for job |

---

**Last updated:** v0.3.0 (2026-02-22)
