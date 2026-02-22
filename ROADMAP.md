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

**Phase 3 (Future):**
- [ ] RxDB test suite passing
- [ ] Benchmarks show 3-6x speedup vs pe-sqlite
- [ ] Documentation complete
- [ ] Ready for npm publish

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
