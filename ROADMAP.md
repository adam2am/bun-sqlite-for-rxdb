# bun-sqlite-for-rxdb Roadmap

> **Status:** Phase 2 Complete ✅ | Phase 3 Complete ✅
> **Last Updated:** 2026-02-23

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

## 🚧 Phase 2: Query Builder & Production Hardening (COMPLETE ✅)

**Goal:** 10-100x query speedup + production-ready features

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
- ✅ Research-driven approach (codebase + web search agents)
- ✅ No bandaids - proper types throughout

**Performance:**
- ✅ Queries: Use SQL WHERE clauses with indexes
- ✅ Fallback: In-memory filtering if WHERE fails
- ⏳ Benchmark: Not yet measured (script ready)

**Total Effort:** 8 hours (4h planned + 4h type safety)  
**Status:** COMPLETE ✅

---

### **Phase 2.2: WAL Mode (COMPLETE ✅)**

**Delivered:**
```typescript
// src/instance.ts line 55
this.db.run("PRAGMA journal_mode = WAL");
```

**Impact:** 3-6x write speedup, better concurrency

**Status:** ✅ COMPLETE

---

### **Phase 2.3: JSONB Storage (COMPLETE ✅)**

**Delivered:**
```typescript
// CREATE TABLE with BLOB column
CREATE TABLE users (id TEXT PRIMARY KEY, data BLOB NOT NULL);

// INSERT with jsonb() function
INSERT INTO users (id, data) VALUES (?, jsonb(?));

// SELECT with json() function
SELECT json(data) as data FROM users WHERE id = ?;
```

**Benchmark Results** (`benchmarks/text-vs-jsonb.ts`):
```
1M documents, 15 runs each:
- Simple query:  1.04x faster (481ms → 464ms)
- Complex query: 1.57x faster (657ms → 418ms) 🔥
- Read + parse:  1.20x faster (2.37ms → 1.98ms)
```

**Impact:** 1.57x faster complex queries, 1.20x faster reads

**Status:** ✅ COMPLETE (implemented as default storage format)

---

### **Phase 2.4: Conflict Detection (COMPLETE ✅)**

**Delivered:**
```typescript
// src/instance.ts line 108
status: 409,  // Proper RxDB conflict handling
```

**Impact:** Required for replication support

**Status:** ✅ COMPLETE

---

### **Phase 2.5: Query Builder Caching (COMPLETE ✅)**

**Goal:** Cache query builders by schema hash for faster repeated queries

**What We Did:**
1. ✅ Implemented LRU cache with canonical key generation (fast-stable-stringify)
2. ✅ True LRU eviction (delete+re-insert on access)
3. ✅ 500 entry limit with FIFO eviction
4. ✅ Zero dependencies except fast-stable-stringify (5KB)
5. ✅ Created 13 edge case tests (object key order, cache thrashing, etc.)

**Performance:**
- ✅ 4.8-22.6x speedup for cached queries
- ✅ High-frequency: 565K-808K queries/sec
- ✅ Memory stress: 1000 unique queries handled correctly

**Status:** ✅ COMPLETE

---

## 📊 Phase 3: Validation & Benchmarking (COMPLETE ✅)

**Goal:** Prove correctness with official tests, then measure performance

**Philosophy:** Trust the official test suite. Don't reinvent the wheel.

### **Phase 3.1: RxDB Official Test Suite (COMPLETE ✅)**

**Why:** Official validation proves our adapter works correctly. Period.

**What We Did:**
1. ✅ Ran official test suite: `DEFAULT_STORAGE=custom bun run mocha test_tmp/unit/rx-storage-implementations.test.js`
2. ✅ Fixed statement lifecycle issues:
   - Switched from db.prepare() to db.query() for static SQL (caching)
   - Used db.prepare() + finalize() for dynamic SQL (no cache pollution)
   - Created StatementManager abstraction layer for automatic cleanup
3. ✅ Implemented connection pooling with reference counting
4. ✅ Switched to RxDB's official `addRxStorageMultiInstanceSupport()`
5. ✅ Fixed composite primary key handling
6. ✅ Rewrote multi-instance tests to use RxDatabase (proper integration level)
7. ✅ Added low-level changeStream tests for OUR code only
8. ✅ Added Bun test suite compatibility (node:sqlite import fix + test globals)

**Test Results:**
```
Local Tests: 120/120 pass (100%) ✅
Official RxDB Tests (Mocha through Bun): 112/112 pass (100%) ✅
Total: 232/232 tests pass (100%) 🎉
```

**Key Findings:**
- db.query() caches statements (max 20) - good for static SQL
- db.prepare() requires manual finalize() - good for dynamic SQL
- StatementManager abstraction eliminates manual try-finally boilerplate
- Connection pooling is REQUIRED for multi-instance support (not optional)
- RxDB's official multi-instance support handles BroadcastChannel correctly
- Test at the right level: RxDatabase for integration, storage instances for low-level
- Mocha through Bun: 100% compatibility, native bun test: 98.2%

**Effort:** 16 hours (investigation + implementation + debugging + test rewrites)

**Status:** ✅ COMPLETE (2026-02-23)

---

### **Phase 3.2: Performance Benchmarks (PRIORITY 2)**

**Why:** After correctness is proven, measure and document performance gains.

**Tasks:**
1. Benchmark vs pe-sqlite-for-rxdb (better-sqlite3)
2. Measure write throughput (docs/sec)
3. Measure query latency at scale (1k, 10k, 100k docs)
4. Document performance gains in README
5. Create performance comparison charts

**Expected outcome:** Documented proof of performance claims

**Effort:** 4 hours

**What We Did:**
1. ✅ Created raw database benchmarks (bun:sqlite vs better-sqlite3)
2. ✅ Tested with WAL + PRAGMA synchronous = 1
3. ✅ Ran 1M document benchmarks (2 runs for consistency)
4. ✅ Updated README with performance results

**Performance:**
- ✅ Bun:sqlite 1.06-1.68x faster than better-sqlite3
- ✅ WAL + PRAGMA enabled by default in production code

**Status:** ✅ COMPLETE

---

### **Phase 3.3: Custom Tests (OPTIONAL - YAGNI)**

**Why:** Only if users report specific edge cases not covered by official suite.

**Status:** ❌ SKIPPED (not needed - official suite is comprehensive)

---

---

## 🔮 Phase 4: v1.0 Release Preparation (COMPLETE ✅)

**Goal:** Ship production-ready v1.0 with attachments support

**Prerequisites:** ✅ Phase 3 complete (246/246 tests passing)

**Current Status:** Production-ready adapter with full attachments support

**Research Complete (2026-02-23):**
- ✅ 4 codebase search agents examined: Dexie, Memory, SQLite/MongoDB official storages
- ✅ 1 web search agent researched: Industry patterns (PostgreSQL, IndexedDB, PouchDB)
- ✅ Synthesis complete: Minimal correct implementation identified

**v1.0 Requirements (ALL COMPLETE):**
1. ✅ **Operators** - DONE in v0.4.0 (18 operators)
2. ✅ **Attachments** - DONE (4 tests passing, getAttachmentData implemented)
3. ✅ **Refactor bulkWrite** - DONE (uses categorizeBulkWriteRows() helper)

**Post-v1.0 (Future Enhancements):**
- Query normalization helpers (`normalizeMangoQuery`, `prepareQuery`) for better cache hit rate
- Schema migrations (user_version pragma) - needs design, not storage-level
- Query plan hints (EXPLAIN QUERY PLAN) - optimization, not critical
- Custom indexes - advanced feature, defer until requested
- Attachment deduplication by hash - industry pattern, adds complexity

**Status:** ✅ COMPLETE (2026-02-23)

---

### **RxDB Helper Functions (v1.0 Implementation)**

**Source:** Research from 6 codebase search agents (2026-02-23)

**MUST USE for v1.0:**

1. **`categorizeBulkWriteRows()`** ⭐⭐⭐
   - **Purpose:** Battle-tested conflict detection + attachment extraction
   - **Why:** Used by ALL official adapters (Dexie, MongoDB, SQLite)
   - **Returns:** `{ bulkInsertDocs, bulkUpdateDocs, errors, eventBulk, attachmentsAdd/Remove/Update }`
   - **Status:** ✅ DONE - Implemented in src/rxdb-helpers.ts (lines 69-251)

2. **`stripAttachmentsDataFromDocument()`** ⭐⭐
   - **Purpose:** Remove attachment .data field, keep metadata
   - **When:** Before storing documents with attachments
   - **Status:** ✅ DONE - Implemented in src/rxdb-helpers.ts (lines 50-60)

3. **`stripAttachmentsDataFromRow()`** ⭐⭐
   - **Purpose:** Strip attachments from bulk write rows
   - **When:** Processing bulkWrite with attachments
   - **Status:** ✅ DONE - Implemented in src/rxdb-helpers.ts (lines 62-67)

4. **`attachmentWriteDataToNormalData()`** ⭐⭐
   - **Purpose:** Convert attachment write format to storage format
   - **When:** Processing attachment writes
   - **Status:** ✅ DONE - Implemented in src/rxdb-helpers.ts (lines 38-48)

5. **`getAttachmentSize()`** ⭐⭐
   - **Purpose:** Calculate attachment size from base64
   - **When:** Attachment metadata
   - **Status:** ✅ DONE - Implemented in src/rxdb-helpers.ts (lines 34-36)

**ALREADY USING:**
- ✅ `ensureRxStorageInstanceParamsAreCorrect()` - Constructor validation

**OPTIONAL (Post-v1.0):**
- `normalizeMangoQuery()` - Query normalization for better cache hit rate
- `prepareQuery()` - Query plan hints for optimization

**NOT NEEDED (RxDB Internal):**
- ❌ `getSingleDocument()`, `writeSingle()`, `observeSingle()` - Convenience wrappers
- ❌ `getWrappedStorageInstance()` - RxDB wraps OUR storage
- ❌ `flatCloneDocWithMeta()` - RxDB internal
- ❌ `getWrittenDocumentsFromBulkWriteResponse()` - RxDB internal

**Implementation:**
All helper functions implemented in `src/rxdb-helpers.ts` (custom implementations, not imported from RxDB)

---

## 📋 Current Priorities

### **Completed (2026-02-23):**
1. ✅ Phase 1: Minimal Working Core
2. ✅ Phase 2: Query Builder & Production Hardening
   - ✅ Phase 2.1: Basic Operators
   - ✅ Phase 2.2: WAL Mode
   - ✅ Phase 2.3: JSONB Storage
   - ✅ Phase 2.4: Conflict Detection
   - ✅ Phase 2.5: Query Builder Caching (4.8-22.6x speedup)
3. ✅ Phase 3: Validation & Benchmarking
   - ✅ Phase 3.1: RxDB Official Test Suite (112/112 passing)
   - ✅ Phase 3.2: Performance Benchmarks (1.06-1.68x faster than better-sqlite3)

**Test Results:** 260/260 tests passing (100%)
- Our tests: 138/138 ✅
- Official RxDB: 122/122 ✅

### **v1.0 Release Ready:**
1. ✅ **Attachments Implemented**
   - Attachments table with composite keys (documentId||attachmentId)
   - `getAttachmentData()` method with digest validation
   - All 5 RxDB helpers implemented
   - 4 comprehensive test cases
2. ✅ **bulkWrite Refactored**
   - Uses `categorizeBulkWriteRows()` helper
   - Clean architecture with proper conflict handling
   - Automatic attachment extraction
3. ✅ **Full test suite passing** - 260/260 tests (100%)
4. 📦 **Ready for npm publish v1.0.0**
5. 🎉 **Community adoption** - Gather feedback, iterate

---

## 🎓 Key Learnings (From Crew Research)

### **From Web Search Agent (RxDB Requirements):**
- All RxStorageInstance methods documented ✅
- Mango query operators: $eq, $gt, $in, $or, $regex, etc. ✅
- Conflict resolution: revision-based with _rev field ✅
- Attachments: base64-encoded strings ✅
- Performance expectations: <10ms writes, binary search queries ✅

### **From Codebase Search Agent (SQLite Patterns):**
- Prepared statements: Cache by schema hash ✅
- Indexes: deleted+id, mtime_ms+id (we already have!) ✅
- Transactions: Use wrapper for atomicity ✅
- WAL mode: Enable once at init ✅
- Schema: JSONB BLOB + metadata columns ✅

### **From Codebase Search Agent (Gap Analysis):**
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

> "Don't over-engineer. Build what you need, when you need it.
>  Bad programmers worry about the code. Good programmers worry about data structures and their relationships first."

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

**Phase 4 (v1.0 Preparation - COMPLETE ✅):**
- ✅ Operators: DONE in v0.4.0 (18 operators implemented)
- ✅ RxDB official test suite: DONE (122/122 passing)
- ✅ Benchmarks: DONE (1.06-1.68x faster than better-sqlite3)
- ✅ Conflict handling: DONE (409 errors with documentInDb)
- ✅ Attachments support (getAttachmentData + 4 tests passing)
- ✅ Refactor bulkWrite (uses categorizeBulkWriteRows helper)
- ✅ All 5 RxDB helper functions implemented
- ✅ Test Results: 260/260 tests passing (138 local + 122 official)

---

## 🚀 Post-v1.0 Enhancements (Future)

**These are NOT blockers for v1.0. Implement when users request them.**

### **Custom Indexes from schema.indexes (HIGH PRIORITY)**

**Research Complete (2026-02-23):**
- ✅ 2 codebase search agents analyzed RxDB core + storage plugins
- ✅ 1 web search agent researched SQLite best practices + industry standards
- ✅ Unanimous verdict: IMPLEMENT IT

**Evidence:**
- **4 out of 5 RxDB storage plugins implement this** (Dexie, Memory, MongoDB, FoundationDB)
- **Query planner depends on it** for optimization (query-planner.ts:39)
- **Dedicated test file** with 20+ cases (custom-index.test.ts)
- **Industry standard:** Production storage adapters create 2-5 targeted indexes

**Performance Impact:**
- **1000x-1,000,000x speedup** for selective queries on large tables (SQLite official docs)
- Covering indexes cut query time in half
- ORDER BY optimization eliminates sorting steps

**Implementation:**
```typescript
// On collection creation
if (schema.indexes) {
    for (const index of schema.indexes) {
        const indexName = `idx_${collectionName}_${index.join('_')}`;
        const columns = Array.isArray(index) ? index.join(', ') : index;
        db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${collectionName}(${columns})`);
    }
}
```

**Effort:** 2-3 hours (not 4-6)
- Parse schema.indexes: 30 min
- Generate CREATE INDEX SQL: 30 min
- Add to schema setup: 30 min
- Testing: 1 hour

**Why implement:**
- ✅ Required for feature parity with official RxDB storage plugins
- ✅ Query planner cannot optimize without it
- ✅ Users expect this functionality (defined in RxJsonSchema type)
- ✅ Critical for read-heavy workloads (typical in RxDB)

**Status:** 📋 Recommended for v1.1.0

**UPDATE (2026-02-23): ✅ IMPLEMENTED in v1.1.0**

**Implementation Complete:**
- ✅ 9 lines of code in instance.ts (lines 84-91)
- ✅ Parses schema.indexes correctly
- ✅ Creates indexes with json_extract() for JSONB fields
- ✅ Supports single-field and compound indexes
- ✅ All tests passing: 260/260 (100%)

**Performance Results:**
```
Baseline (NO indexes, WITH ORDER BY):  165.43ms avg
With schema.indexes, NO ORDER BY:      116.09ms avg
Improvement: 29.8% faster
```

**Additional Optimization - Removed Redundant ORDER BY:**
- Discovered: We already sort in-memory (line 226)
- SQL ORDER BY id was redundant and causing temp B-tree overhead
- Removed ORDER BY from SQL query
- Result: 29.8% total performance improvement

**Research Validation:**
- ✅ 4/5 RxDB storage plugins implement schema.indexes
- ✅ Our implementation matches standard RxDB patterns
- ✅ Better than official SQLite Trial (which has no indexes)
- ✅ No other plugin creates covering indexes (standard behavior)

**Status:** ✅ COMPLETE (v1.1.0)

---

## 📋 REMOVED from Roadmap (Research Findings)

**These features DON'T EXIST in RxDB or are already complete:**

### ❌ conflictResolutionTasks() / resolveConflictResultionTask()
- **Status:** REMOVED in RxDB 16.0.0
- **Evidence:** Release notes explicitly state removal
- **What we have:** 409 error handling (correct approach)
- **Conflict resolution:** Happens at replication level, NOT storage level

### ✅ Operators
- **Status:** DONE in v0.4.0
- **Implemented:** 18 operators ($eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $and, $or, $exists, $regex, $elemMatch, $not, $nor, $type, $size, $mod)

### ❌ normalizeMangoQuery() / prepareQuery()
- **Status:** OUT OF SCOPE - RxDB core responsibility
- **Evidence:** Implemented in `rx-query-helper.ts` (lines 35, 269)
- **What storage receives:** `PreparedQuery` objects (already normalized with query plans)
- **Interface comment:** "User provided mango queries will be filled up by RxDB via normalizeMangoQuery()"
- **Conclusion:** Storage adapters do NOT implement these

### ❌ user_version pragma for Schema Migrations
- **Status:** OUT OF SCOPE - RxDB handles migrations at collection level
- **Evidence:** No storage plugin uses `user_version`, migrations in `plugins/migration-schema/`
- **How RxDB handles it:** Schema version in `schema.version`, migrations via plugins
- **Conclusion:** Storage adapters are version-agnostic, only store data for specific schema version

### ❌ EXPLAIN QUERY PLAN
- **Status:** OUT OF SCOPE - RxDB provides query plans
- **Evidence:** No storage plugin uses EXPLAIN QUERY PLAN
- **What RxDB provides:** `PreparedQuery.queryPlan` with index hints from `query-planner.ts`
- **Interface comment:** "queryPlan is a hint... not required to use it"
- **Conclusion:** Storage adapters receive query plans, don't need to generate them

---

## 🔬 Future Research Topics

#### **Hybrid SQL+Mingo Pattern (QUESTION MARK)**

**Goal:** Implement SQL pre-filter + Mingo post-filter IF senior provides evidence.

**Status:** ❓ **ON HOLD** - Waiting for senior to provide:
- Production examples using this pattern
- Benchmarks proving it's faster than pure SQL
- Use cases where it's needed

**If validated:**
1. Implement hybrid query executor
2. Benchmark vs pure SQL
3. Document when to use each approach

**Effort:** 2 hours (if validated)  
**Status:** ❓ Unproven - need evidence from senior


---

## 🔬 v1.2.0: Complex Operator Optimization (Future)

**Current State (v1.1.4):**
- ✅ All simple SQL operators working (162/162 tests passing)
- ✅ Mingo routing architecture implemented (canTranslateToSQL + upfront routing)
- ✅ All 168 tests passing (6 complex operator tests now use Mingo)
- ✅ 100% routing accuracy (SQL vs Mingo decision is correct)

**The Vision:** Superfast bun:sqlite for ALL operators, no hybrid fallbacks

### **Baseline Performance (2026-02-24)**

**Mingo Routing Architecture - 10k documents, 10 runs:**

| Query Type | Avg | Min | Max | Median | StdDev | Route |
|------------|-----|-----|-----|--------|--------|-------|
| Complex $regex char class | 60.77ms | 45.31ms | 126.80ms | 52.96ms | 22.80ms | Mingo |
| Complex $regex case-insensitive | 42.24ms | 33.14ms | 60.23ms | 41.37ms | 7.67ms | Mingo |
| $elemMatch | 74.68ms | 67.32ms | 88.39ms | 73.08ms | 6.22ms | Mingo |
| ~~$type array~~ | ~~52.44ms~~ | ~~44.25ms~~ | ~~95.37ms~~ | ~~47.63ms~~ | ~~14.72ms~~ | ~~Mingo~~ |
| **$type array** ✅ | **33.07ms** | **27.33ms** | **44.25ms** | **27.33ms** | **5.12ms** | **SQL** |

**SQL vs Mingo Performance Gap:** 5.69x slower for Mingo (avg 57.53ms vs 10.12ms)

**$type array Optimization (v1.2.0):** 1.59x faster than Mingo (33.07ms vs 52.44ms) 🚀

**Optimization Strategy:** Implement pure SQL for each operator one by one, measure improvements

**Long-term Goal:** Remove Mingo fallback entirely once all operators are pure SQL (dead code elimination)

### **Two Paths Forward:**

#### **Path A: Mingo Fallback (Quick Fix - 10 minutes)**
- Use Mingo for complex operators that SQL can't handle
- Pros: Battle-tested, handles ALL operators, ships today
- Cons: 1.65x slower than SQL (326ms vs 198ms on 100k docs)
- Use case: Rare complex queries (<1% of workload)

#### **Path B: Pure SQL Implementation (Proper Fix - 2-4 hours)**
**Inspired by industry standards (Mingo patterns) but leveraging bun:sqlite speed**

**Complex operators to implement:**

| Operator | SQL Implementation | Effort | Speedup | Status |
|----------|-------------------|--------|---------|--------|
| ~~`$type` (array/object)~~ | ~~`json_type()` check~~ | ~~15 min~~ | ~~1.65x~~ | ✅ **DONE** (1.59x faster) |
| `$elemMatch` | `EXISTS + json_each()` subquery | 1 hour | Unknown | 📋 Next |
| `$regex` with flags | `LOWER() + LIKE` for case-insensitive | 30 min | 1.65x | 📋 Next |
| `$regex` (complex) | Register custom SQLite function | 1 hour | Same as Mingo | 📋 Future |

**Decision Matrix:**
- If complex operators are <1% of queries → Ship Mingo fallback (Path A)
- If complex operators are >10% of queries → Implement pure SQL (Path B)
- **Recommendation:** Ship Path A now, measure usage, optimize Path B if needed

**Linus Principle:**
> "Don't optimize code that isn't proven to be a bottleneck. Ship it, measure it, then optimize if needed."

### **v1.2.0 Potential Features:**
1. **Mingo Fallback** (Priority 1 - fixes 6 failing tests)
   - Implement Mingo for complex operators
   - Measure fallback usage in production
   - Decide if pure SQL optimization is needed

2. **Pure SQL Complex Operators** (Priority 2 - if metrics show need)
   - Implement `$type` with `json_type()` (easy win)
   - Implement case-insensitive regex with `LOWER() + LIKE`
   - Benchmark `$elemMatch` with `json_each()` vs Mingo
   - Only implement if fallback is >10% of queries

3. **Covering Indexes** (Priority 3 - further optimization)
   - Add primary key to compound indexes
   - Potential for additional query speedup

**Status:** 📋 Planning - measure before optimizing

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

_Last updated: 2026-02-23 by adam2am_
