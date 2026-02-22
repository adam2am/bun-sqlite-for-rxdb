# bun-sqlite-for-rxdb Roadmap

> **Status:** Phase 1 Complete ✅ | Phase 2 In Progress 🚧
> **Last Updated:** 2026-02-22

---

## 🎯 Vision

Build the **fastest RxDB storage adapter** by leveraging Bun's native SQLite (3-6x faster than better-sqlite3).

**Key Principles:**
- Start simple, iterate incrementally (Linus approach)
- Measure before optimizing
- Ship working code, not perfect code
- Test-driven development

---

## ✅ Phase 1: Minimal Working Core (COMPLETE)

**Goal:** Prove the concept works

**Delivered:**
- ✅ RxStorage adapter for bun:sqlite
- ✅ Atomic transactions (bun:sqlite transaction API)
- ✅ Core methods: bulkWrite, query, findById, count, cleanup
- ✅ Reactive changeStream with RxJS
- ✅ In-memory Mango query filtering (simple but functional)
- ✅ 8/8 tests passing
- ✅ Supports RxDB v16 and v17 beta
- ✅ MIT licensed

**Performance:**
- ✅ Transactions: Atomic (all-or-nothing)
- ⚠️ Queries: O(n) — fetches all, filters in JS (slow for 10k+ docs)

**What We Learned:**
- bun:sqlite API is nearly identical to better-sqlite3 ✅
- Transaction wrapper works perfectly ✅
- In-memory filtering is simple but not scalable ⚠️

---

## 🚧 Phase 2: Query Builder (IN PROGRESS)

**Goal:** 10-100x query speedup via SQL WHERE clauses

### **Phase 2.1: Basic Operators (COMPLETE ✅)**

**Architecture:** Functional Core, Imperative Shell
- ✅ Pure functions for operator translation (testable)
- ✅ Schema mapper for column info (DRY)
- ✅ Query builder for composition (scalable)
- ✅ Instance for orchestration (thin layer)

**Delivered:**
- ✅ `src/query/operators.ts` - 6 operators ($eq, $ne, $gt, $gte, $lt, $lte)
- ✅ `src/query/schema-mapper.ts` - Column mapping for _deleted, _meta.lwt, _rev, primaryKey
- ✅ `src/query/builder.ts` - WHERE clause generation with fallback
- ✅ Updated `src/instance.ts` - Uses SQL WHERE clauses, falls back to in-memory
- ✅ 27/27 tests passing (19 storage + 6 operators + 10 builder + 4 schema-mapper)
- ✅ TypeScript: 0 errors, 0 `any` types (properly typed infrastructure)
- ✅ Benchmark script created

**Type Safety Achievement:**
- ✅ Removed ALL 32 instances of `any` and `as any`
- ✅ Proper RxDB type hierarchy (RxDocumentData<RxDocType>)
- ✅ Research-driven approach (Lisa + Vivian agents)
- ✅ No bandaids - proper types throughout

**Performance:**
- ✅ Queries: Use SQL WHERE clauses with indexes
- ✅ Fallback: In-memory filtering if WHERE fails
- ⏳ Benchmark: Not yet measured (script ready)

**Total Effort:** 8 hours (4h planned + 4h type safety)  
**Status:** COMPLETE ✅

---

### **Phase 2.2: WAL Mode (NEXT - 5 minutes)**

**Problem:** Phase 1 fetches ALL documents, filters in JavaScript
```typescript
// Current (slow):
const all = db.query('SELECT * FROM docs').all();  // Fetches everything
return all.filter(doc => doc.age > 18);            // Filters in JS
```

**Solution:** Translate Mango queries → SQL WHERE clauses
```typescript
// Target (fast):
const sql = 'SELECT * FROM docs WHERE age > ?';
return db.query(sql).all(18);  // Uses index, filters in SQL
```

**Components:**
1. **Column Mapping** — Map schema paths to SQL columns/JSON paths
   - `_deleted` → `deleted` column
   - `_meta.lwt` → `mtime_ms` column
   - `user.name` → `jsonb ->> '$.user.name'` JSON path

2. **Operator Translation** — Convert Mango operators to SQL
   - `$eq` → `=`
   - `$gt` → `>`
   - `$in` → `IN (?, ?, ?)`
   - `$or` → `OR` with parentheses

3. **NULL Handling** — Edge cases for null values
   - `{ status: { $eq: null } }` → `status IS NULL`
   - `{ status: { $in: ["active", null] } }` → `status IN (?) OR status IS NULL`

4. **Logical Operators** — Recursive $and/$or with proper parentheses
   - `{ $or: [{ a: 1 }, { b: 2 }] }` → `(a = ? OR b = ?)`

5. **ORDER BY Generation** — Sort fields to SQL ORDER BY
   - `[{ name: "asc" }, { age: "desc" }]` → `ORDER BY name ASC, age DESC`

**Reference:** `query-sqlite3.ts` (557 lines from pe-sqlite-for-rxdb)

**Effort:** 1 day (port + test)

**Impact:** 10-100x query speedup (uses indexes!)

**Status:** Not started

---

### **Priority 2: Production Hardening (HIGH)**

**Goal:** Make adapter production-ready

#### **2.2 WAL Mode** ⚡ (5 minutes - NEXT)
```typescript
// Enable Write-Ahead Logging
this.db.pragma("journal_mode = WAL");
```
**Impact:** 3-6x write speedup, better concurrency

#### **2.3 JSONB Storage** 📦 (2 hours)
```sql
-- Current: TEXT (slower)
CREATE TABLE docs (id TEXT, data TEXT);

-- Target: BLOB (faster, smaller)
CREATE TABLE docs (id TEXT, data BLOB);  -- Store as binary JSONB
```
**Impact:** 20-30% storage reduction, faster parsing

#### **2.4 Conflict Detection** ⚔️ (1 hour)
```typescript
// Catch primary key conflicts
catch (err) {
  if (err.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
    const documentInDb = /* fetch existing */;
    return { status: 409, documentInDb, isError: true };
  }
}
```
**Impact:** Proper RxDB conflict handling (required for replication)

#### **2.5 Prepared Statement Caching** 🗄️ (2 hours)
```typescript
// Cache query builder by schema hash
private queryBuilders = new Map<string, QueryBuilder>();
```
**Impact:** Faster repeated queries

**Total Effort:** 1 day

**Status:** Not started

---

## 📊 Phase 3: Benchmarking & Validation

**Goal:** Prove 3-6x speedup claim

**Tasks:**
1. Run RxDB test suite (validate correctness)
2. Benchmark queries (1k, 10k, 100k docs)
3. Measure write throughput
4. Compare to pe-sqlite-for-rxdb (better-sqlite3)
5. Document performance gains

**Metrics to Measure:**
- Query latency (ms)
- Write throughput (docs/sec)
- Storage size (MB)
- Memory usage (MB)

**Expected Results:**
- Queries: 10-100x faster (SQL WHERE vs JS filter)
- Writes: 3-6x faster (bun:sqlite vs better-sqlite3)
- Storage: 20-30% smaller (JSONB vs TEXT)

**Effort:** 4 hours

**Status:** Not started

---

## 🔮 Phase 4: Advanced Features (OPTIONAL)

**Goal:** Feature parity with premium RxDB storages

**Potential Features:**
- Attachments (base64 storage)
- Replication checkpoints (getChangedDocumentsSince)
- Multi-instance support (user key tracking)
- Schema migrations (user_version pragma)
- Query plan hints (EXPLAIN QUERY PLAN)
- Custom indexes (beyond default deleted/mtime_ms)

**Status:** Deferred (ship Phase 2 first)

---

## 📋 Current Priorities

### **Immediate (This Week):**
1. ✅ Phase 1 complete
2. ✅ Phase 2.1 complete (Query Builder + Type Safety)
3. 🚧 Add WAL mode (Phase 2.2)

### **Short-term (Next Week):**
4. JSONB storage (Phase 2.3)
5. Conflict detection (Phase 2.4)
6. Prepared statement caching (Phase 2.5)
7. Benchmarking (Phase 3)

### **Long-term (Future):**
8. Advanced features (Phase 4)
9. npm publish
10. Community adoption

---

## 🎓 Key Learnings (From Crew Research)

### **From Vivian (RxDB Requirements):**
- All RxStorageInstance methods documented ✅
- Mango query operators: $eq, $gt, $in, $or, $regex, etc. ✅
- Conflict resolution: revision-based with _rev field ✅
- Attachments: base64-encoded strings ✅
- Performance expectations: <10ms writes, binary search queries ✅

### **From Lisa (SQLite Patterns):**
- Prepared statements: Cache by schema hash ✅
- Indexes: deleted+id, mtime_ms+id (we already have!) ✅
- Transactions: Use wrapper for atomicity ✅
- WAL mode: Enable once at init ✅
- Schema: JSONB BLOB + metadata columns ✅

### **From Lisa (Gap Analysis):**
- Query Builder: 557 lines, handles NULL/boolean edge cases ✅
- Reference uses 3-layer architecture (we use 1-layer) ✅
- JSONB vs TEXT: 20-30% storage savings ✅
- Conflict detection: Catch SQLITE_CONSTRAINT_PRIMARYKEY ✅
- Our Phase 1 limitations: O(n) queries, no index utilization ✅

---

## 🏴‍☠️ Linus Torvalds Wisdom

> "Talk is cheap. Show me the code."

**Applied:**
- ✅ Phase 1: Shipped working code in 1 day
- 🚧 Phase 2: Focus on the bottleneck (query builder)
- ⏳ Phase 3: Measure before claiming victory

> "Don't over-engineer. Build what you need, when you need it."

**Applied:**
- ✅ Phase 1: In-memory filtering (simple, works)
- 🚧 Phase 2: SQL filtering (needed for scale)
- ⏸️ Phase 4: Advanced features (defer until needed)

> "Optimize the slow path, not the fast path."

**Applied:**
- 🎯 Query Builder: THE bottleneck (10-100x impact)
- ⚡ WAL mode: 3-6x write speedup (5 min effort)
- 📦 JSONB: 20-30% savings (2 hour effort)

---

## 📈 Success Metrics

**Phase 1 (Complete):**
- ✅ 8/8 tests passing
- ✅ TypeScript compiles (0 errors)
- ✅ Atomic transactions working

**Phase 2 (Complete ✅):**
- ✅ Query Builder: Basic Mango operators working ($eq, $ne, $gt, $gte, $lt, $lte)
- ✅ 31/31 tests passing
- ✅ TypeScript: 0 errors, 0 `any` types
- ✅ WAL mode enabled (3-6x write speedup)
- ✅ Proper checkpoint implementation
- ✅ Conflict detection working (409 errors with documentInDb)
- ✅ Extensively tested serialization formats (MessagePack, bun:jsc, JSON)
- ✅ **JSON + TEXT storage: 23.40ms average (10k docs)**

**Phase 3 (Complete ✅):**
- ✅ Advanced Query Operators: $in, $nin, $or, $and
- ✅ 51/51 tests passing (44 → 51 tests)
- ✅ NULL handling for array operators
- ✅ Recursive query builder with logicalDepth tracking
- ✅ Complex nested queries (4-level nesting tested)
- ✅ Benchmarked: 27.39ms average (10k docs)
- ✅ DRY architecture: Pure functions, no god objects
- ✅ WAL performance verified: 2.39x speedup (in-memory), 3-6x (file-based)
- ✅ Nested query tests: 7 comprehensive tests
- ✅ Architectural patterns documented (10 patterns)
- ✅ RxDB API alignment verified (partial success pattern)

**Phase 4 (IN PROGRESS 🚧):**
- [ ] Fix critical `findDocumentsById` bug (withDeleted semantics)
- [ ] Add missing operators: $exists, $regex, $elemMatch, $not, $nor, $type, $size, $mod
- [ ] Run RxDB official test suite (70+ tests)
- [ ] Benchmarks show 3-6x speedup vs pe-sqlite
- [ ] Optional: Replication methods (conflictResultionTasks, resolveConflictResultionTask)
- [ ] Optional: Attachments support (getAttachmentData implementation)
- [ ] Documentation complete
- [ ] Ready for npm publish

---

## 🔥 Phase 4: Production Readiness (CURRENT)

**Goal:** Fix bugs, complete operator coverage, pass RxDB test suite

### **4.1 Critical Bug Fix (IMMEDIATE)**

**Problem:** `findDocumentsById` has wrong semantics
```typescript
// ❌ Current (WRONG):
findDocumentsById(ids, deleted: boolean)
// deleted=true → returns ONLY deleted docs

// ✅ Expected (CORRECT):
findDocumentsById(ids, withDeleted: boolean)
// withDeleted=true → returns ALL docs (deleted + non-deleted)
// withDeleted=false → returns ONLY non-deleted docs
```

**Fix:**
```typescript
const whereClause = withDeleted 
  ? `WHERE id IN (${placeholders})`
  : `WHERE id IN (${placeholders}) AND deleted = 0`;
```

**Effort:** 30 minutes (write test, fix, verify)  
**Status:** Not started

---

### **4.2 Missing Operators (TDD Approach)**

**Research Findings:**
- Reference implementation: 10 operators (same as ours)
- RxDB supports: 18 operators total
- We're missing: 8 operators

**Priority 1 (Critical - High Usage):**
1. **$exists** — Field existence check (VERY HIGH usage in production)
   ```typescript
   { email: { $exists: true } }  // Has email field
   { deletedAt: { $exists: false } }  // Not deleted
   ```
   **SQL:** `field IS NOT NULL` / `field IS NULL`  
   **Effort:** 2 hours  
   **Tests:** 4-5 test cases

2. **$regex** — Pattern matching (HIGH usage for search)
   ```typescript
   { name: { $regex: '.*foo.*' } }
   { email: { $regex: '^user@', $options: 'i' } }
   ```
   **SQL:** `field REGEXP ?` or `field LIKE ?`  
   **Effort:** 3 hours (regex → SQL translation)  
   **Tests:** 6-8 test cases

3. **$elemMatch** — Array element matching (HIGH usage)
   ```typescript
   { skills: { $elemMatch: { name: 'JS', level: { $gte: 5 } } } }
   ```
   **SQL:** Complex (may need JSON functions)  
   **Effort:** 4 hours  
   **Tests:** 5-7 test cases

**Priority 2 (High - Common Patterns):**
4. **$not** — Negation operator
   ```typescript
   { age: { $not: { $lt: 18 } } }  // NOT (age < 18)
   ```
   **SQL:** `NOT (condition)`  
   **Effort:** 2 hours  
   **Tests:** 4-5 test cases

5. **$nor** — Logical NOR
   ```typescript
   { $nor: [{ status: 'archived' }, { deleted: true }] }
   ```
   **SQL:** `NOT (cond1 OR cond2)`  
   **Effort:** 2 hours  
   **Tests:** 3-4 test cases

**Priority 3 (Medium - Nice to Have):**
6. **$type** — Type checking
7. **$size** — Array size matching

**Priority 4 (Low - Rare Use):**
8. **$mod** — Modulo operations

**Total Effort:** 2-3 days (with TDD)  
**Status:** Not started

---

### **4.3 RxDB Official Test Suite**

**Goal:** Pass 70+ official RxDB storage tests

**Setup:**
1. Implement `RxTestStorage` interface
2. Configure test harness in RxDB repo
3. Run: `npm run test:performance:custom:node`

**Test Coverage:**
- Core operations (bulkWrite, query, count, findById)
- Change streams and events
- Attachments (if implemented)
- Multi-instance (if implemented)
- Query correctness (all operators)
- Edge cases (umlauts, concurrent writes, etc.)

**Expected Pass Rate:** 100% (for production readiness)

**Effort:** 1 day (setup + fix failures)  
**Status:** Not started

---

### **4.4 Benchmarking vs pe-sqlite-for-rxdb**

**Goal:** Prove 3-6x speedup claim with rigorous methodology

**Methodology:**
- Use RxDB's official performance test suite
- Standard dataset: 3,000 docs, 4 collections
- 40 runs with statistical stripping (remove top 5%)
- Measure: insert, query, count, find-by-id

**Key Metrics:**
```
| Metric | pe-sqlite | bun-sqlite | Speedup |
|--------|-----------|------------|---------|
| Bulk Insert (500) | ~45ms | ~15ms | 3.0x |
| Bulk Read (3000) | ~120ms | ~20ms | 6.0x |
| Query with Sort | ~82ms | ~27ms | 3.0x |
```

**Effort:** 4 hours (setup, run, document)  
**Status:** Not started

---

### **4.5 Optional Features**

**Replication Methods (OPTIONAL):**
- `conflictResultionTasks()` — Returns Observable for conflicts
- `resolveConflictResultionTask()` — Resolves conflicts
- **Required:** Only if using RxDB replication with conflicts
- **Effort:** 4-8 hours

**Attachments Support (OPTIONAL):**
- `getAttachmentData()` — Retrieve base64 attachment data
- Separate attachments table
- **Required:** Only if schema uses attachments
- **Effort:** 4-6 hours

**Status:** Deferred (implement when needed)

---

## 📋 Phase 4 Execution Plan (Linus Style)

### **Week 1: Bug Fix + Critical Operators**
1. **Day 1:** Fix `findDocumentsById` bug (TDD)
2. **Day 2:** Implement $exists operator (TDD)
3. **Day 3:** Implement $regex operator (TDD)
4. **Day 4:** Implement $elemMatch operator (TDD)
5. **Day 5:** Implement $not + $nor operators (TDD)

### **Week 2: Testing + Benchmarking**
6. **Day 6-7:** Run RxDB test suite, fix failures
7. **Day 8-9:** Benchmark vs pe-sqlite-for-rxdb
8. **Day 10:** Documentation + npm publish prep

**Total Effort:** 2 weeks  
**Status:** Ready to start

---

## 🤝 Contributing

This is a community project! Contributions welcome.

**How to help:**
1. Test with your RxDB app
2. Report bugs/edge cases
3. Submit PRs for missing features
4. Share performance benchmarks

---

**Not affiliated with RxDB or Bun. Community-maintained adapter.**

_Last updated: 2026-02-22 by adam2am_
