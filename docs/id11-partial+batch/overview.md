# ID11: Partial SQL Pushdown + Batch Operations Optimization

**Status:** Baseline Established  
**Date:** 2026-03-01  
**Approach:** Linus Torvalds methodology - Measure first, fix what's proven broken

---

## Executive Summary

Two architectural improvements suggested by Linus Torvalds and Steve Wozniak code review:

1. **Partial SQL Pushdown** - Split mixed queries into SQL-supported + JS-only parts (2.4x speedup expected)
2. **Batch Operations Fix** - Use single prepared statement instead of string concatenation (minimal impact observed)

---

## 1. Partial SQL Pushdown

### The Problem

**Current behavior:** `buildWhereClause()` returns `null` if ANY operator is unsupported (e.g., `$regex`), causing full table scan.

**Example:**
```typescript
{ status: 'active', name: { $regex: '^[A-Z]' } }
```

**Current:** Sees `$regex` → returns `null` → fetches ALL 100k rows → filters in JS  
**Should:** Run `WHERE status = 'active'` in SQLite (gets 50k rows) → filter those 50k with regex in JS

### Baseline Results

| Query Type | Time (ms) | Rows Found | Notes |
|------------|-----------|------------|-------|
| Pure SQL | 162.18 | 50,000 | ✅ Fast (uses SQLite index) |
| Pure regex | 358.11 | 10,000 | ⚠️ Slow (fetches all rows) |
| **Mixed SQL + regex** | **383.92** | **5,000** | **🔴 THE PROBLEM** |

**Impact:** Mixed query is **137% slower** than pure SQL (should be similar after fix)

**Expected improvement:** 383.92ms → ~162.18ms = **2.4x faster**

### Industry Pattern

**Source:** [TanStack/db optimizer.ts](https://github.com/TanStack/db/blob/main/packages/db/src/query/optimizer.ts)

```typescript
// Split AND clauses into single-source (SQL) vs multi-source (JS)
const splitWhereClauses = splitAndClauses(query.where)
const analyzedClauses = splitWhereClauses.map(clause => analyzeWhereClause(clause))
const groupedClauses = groupWhereClauses(analyzedClauses)

// Push single-source clauses to SQL, keep multi-source in JS
const optimizedQuery = applyOptimizations(query, groupedClauses)
```

### Implementation Plan

**Change `buildWhereClause` return type:**
```typescript
interface BipartiteQuery {
  sqlWhere: SqlFragment | null;  // SQL-supported operators
  jsFilters: Array<(doc: RxDocumentData<RxDocType>) => boolean>; // JS-only
}
```

**Files to modify:**
- `src/query/builder.ts` - Split selector into SQL + JS parts
- `src/instance.ts` - Apply SQL filter first, then JS filters

---

## 2. Batch Operations Fix

### The Problem

**Current behavior:** `bulkWrite()` uses string concatenation with dynamic placeholders:

```typescript
const placeholders = batch.map(() => '(?, jsonb(?), ?, ?, ?)').join(', ');
const insertQuery = `INSERT INTO ... VALUES ${placeholders}`;
```

**Issue:** Each batch size generates different SQL → statement cache miss

### Baseline Results

| Test | Avg Time | Notes |
|------|----------|-------|
| Fixed size (100) | 1.13ms | ✅ Consistent |
| Varying sizes | 1.15ms | ⚠️ Only 2% slower |
| Large batch (10k) | 70.08ms | 142,700 docs/sec |

**Observation:** Statement cache thrashing is **minimal** (only 2% overhead). This is much less than expected.

**Possible reasons:**
- Batch sizes too small to show effect
- Statement cache working better than expected
- SQLite compilation is fast enough that cache misses don't matter at this scale

### Industry Pattern

**Source:** [Bun SQLite Docs](https://bun.sh/docs/api/sqlite#transactions)

```typescript
const insert = db.prepare("INSERT INTO cats (name, age) VALUES (?, ?)");

const insertMany = db.transaction((cats) => {
  for (const cat of cats) insert.run(cat.name, cat.age);
});

insertMany([...]);
```

### Implementation Plan

**Replace string concatenation with single prepared statement:**

```typescript
const insertStmt = this.db.prepare(
  `INSERT INTO "${this.tableName}" (id, data, deleted, rev, mtime_ms) VALUES (?, jsonb(?), ?, ?, ?)`
);

const insertBatch = this.db.transaction((docs) => {
  for (const row of docs) {
    const doc = row.document;
    insertStmt.run(id, JSON.stringify(doc), doc._deleted ? 1 : 0, doc._rev, doc._meta.lwt);
  }
});

insertBatch(categorized.bulkInsertDocs);
```

**Files to modify:**
- `src/instance.ts` (lines 161-193) - Replace string concatenation

---

## Priority Assessment

### High Priority: Partial SQL Pushdown
- **Impact:** 2.4x speedup proven by baseline
- **Complexity:** Medium (requires bipartite query splitting)
- **Risk:** Low (can fall back to current behavior if split fails)
- **Recommendation:** ✅ Implement

### Low Priority: Batch Operations
- **Impact:** Minimal (2% improvement observed)
- **Complexity:** Low (straightforward refactor)
- **Risk:** Very low (simpler code, better pattern)
- **Recommendation:** ⚠️ Nice-to-have, but not urgent

---

## Next Steps

1. ✅ Baseline established (this document)
2. ⏳ Implement partial SQL pushdown
3. ⏳ Re-run benchmarks to validate improvement
4. ⏳ (Optional) Implement batch operations fix
5. ⏳ Update CHANGELOG and bump version

---

## References

- **Linus/Woz Review:** Session stepId_2 (2026-03-01)
- **Baseline Benchmarks:**
  - `test/benchmarks/partial-pushdown-baseline.ts`
  - `test/benchmarks/batch-operations-baseline.ts`
- **Industry Patterns:**
  - TanStack/db optimizer (partial pushdown)
  - Bun SQLite docs (batch operations)
  - Angular CLI bundler-context.ts (transaction pattern)
  - Prisma, Signal-Desktop (prepared statement patterns)

---

## Benchmark Files

- `baseline-partial-pushdown.txt` - Raw output from partial pushdown benchmark
- `baseline-batch-operations.txt` - Raw output from batch operations benchmark
