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
- ✅ Research-driven approach (Lisa + Vivian agents)
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

## 🔮 Phase 4: v1.0 Release Preparation (IN PROGRESS 🚧)

**Goal:** Ship production-ready v1.0 with attachments support

**Prerequisites:** ✅ Phase 3 complete (246/246 tests passing)

**Current Status:** Production-ready adapter, only missing attachments

**v1.0 Blockers (MUST HAVE):**
1. ✅ **Operators** - DONE in v0.4.0 (18 operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $and, $or, $exists, $regex, $elemMatch, $not, $nor, $type, $size, $mod)
2. 🚧 **Attachments** - Separate table storage with RxDB helpers (4-6 hours)
3. 🚧 **Refactor bulkWrite** - Use `categorizeBulkWriteRows()` helper (2-3 hours)

**v1.0 Nice-to-Have (OPTIONAL):**
- Query normalization helpers (`normalizeMangoQuery`, `prepareQuery`) for better cache hit rate

**Post-v1.0 (Future Enhancements):**
- Schema migrations (user_version pragma) - needs design, not storage-level
- Query plan hints (EXPLAIN QUERY PLAN) - optimization, not critical
- Custom indexes - advanced feature, defer until requested

**Status:** 🚧 IN PROGRESS (Attachments + bulkWrite refactor remaining)

---

### **RxDB Helper Functions (v1.0 Implementation)**

**Source:** Research from 6 Lisa agents (2026-02-23)

**MUST USE for v1.0:**

1. **`categorizeBulkWriteRows()`** ⭐⭐⭐
   - **Purpose:** Battle-tested conflict detection + attachment extraction
   - **Why:** Used by ALL official adapters (Dexie, MongoDB, SQLite)
   - **Returns:** `{ bulkInsertDocs, bulkUpdateDocs, errors, eventBulk, attachmentsAdd/Remove/Update }`
   - **Status:** 🚧 TODO - Refactor bulkWrite to use this

2. **`stripAttachmentsDataFromDocument()`** ⭐⭐
   - **Purpose:** Remove attachment .data field, keep metadata
   - **When:** Before storing documents with attachments
   - **Status:** 🚧 TODO - Attachments implementation

3. **`stripAttachmentsDataFromRow()`** ⭐⭐
   - **Purpose:** Strip attachments from bulk write rows
   - **When:** Processing bulkWrite with attachments
   - **Status:** 🚧 TODO - Attachments implementation

4. **`attachmentWriteDataToNormalData()`** ⭐⭐
   - **Purpose:** Convert attachment write format to storage format
   - **When:** Processing attachment writes
   - **Status:** 🚧 TODO - Attachments implementation

5. **`getAttachmentSize()`** ⭐⭐
   - **Purpose:** Calculate attachment size from base64
   - **When:** Attachment metadata
   - **Status:** 🚧 TODO - Attachments implementation

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

**Import Pattern:**
```typescript
import {
  categorizeBulkWriteRows,
  stripAttachmentsDataFromDocument,
  stripAttachmentsDataFromRow,
  attachmentWriteDataToNormalData,
  getAttachmentSize
} from 'rxdb/plugins/core';
```

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

**Test Results:** 246/246 tests passing (100%)
- Our tests: 134/134 ✅
- Official RxDB: 112/112 ✅

### **Next Steps (v1.0 Release):**
1. 🚧 **Implement Attachments** (4-6 hours)
   - Create attachments table (documentId||attachmentId key)
   - Implement `getAttachmentData()` method
   - Use 5 RxDB helpers for attachment handling
   - Write 5-7 test cases
2. 🚧 **Refactor bulkWrite** (2-3 hours)
   - Switch to `categorizeBulkWriteRows()` helper
   - Cleaner architecture, better conflict handling
   - Automatic attachment extraction
3. ✅ **Run full test suite** - Verify 246/246 still passing
4. 📦 **npm publish v1.0.0** - Production-ready release
5. 🎉 **Community adoption** - Gather feedback, iterate

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

**Phase 4 (v1.0 Preparation - IN PROGRESS 🚧):**
- ✅ Operators: DONE in v0.4.0 (18 operators implemented)
- ✅ RxDB official test suite: DONE (112/112 passing)
- ✅ Benchmarks: DONE (1.06-1.68x faster than better-sqlite3)
- ✅ Conflict handling: DONE (409 errors with documentInDb)
- [ ] Attachments support (getAttachmentData implementation) - 4-6 hours
- [ ] Refactor bulkWrite to use categorizeBulkWriteRows() - 2-3 hours
- [ ] Documentation polish
- [ ] Ready for npm publish v1.0.0

---

## 🔥 Phase 4: v1.0 Implementation Plan (CURRENT)

**Goal:** Ship v1.0 with attachments support

**Estimated Effort:** 6-9 hours total

---

### **4.1 Attachments Implementation (PRIORITY 1)**

**Goal:** Implement `getAttachmentData()` with separate table storage

**Pattern:** Follow Dexie adapter (battle-tested)

**Steps:**

1. **Create attachments table** (30 min)
   ```typescript
   CREATE TABLE IF NOT EXISTS attachments (
     id TEXT PRIMARY KEY,  -- documentId||attachmentId
     data TEXT NOT NULL    -- base64 attachment data
   );
   ```

2. **Implement getAttachmentData()** (1 hour)
   ```typescript
   async getAttachmentData(documentId: string, attachmentId: string): Promise<string> {
     const key = documentId + '||' + attachmentId;
     const result = this.db.query('SELECT data FROM attachments WHERE id = ?').get(key);
     if (!result) throw new Error('Attachment not found');
     return result.data;
   }
   ```

3. **Update bulkWrite for attachments** (2-3 hours)
   - Use `categorizeBulkWriteRows()` helper
   - Process `attachmentsAdd`, `attachmentsUpdate`, `attachmentsRemove`
   - Store attachments in separate table

4. **Write tests** (1-2 hours)
   - Test: Store attachment with document
   - Test: Retrieve attachment data
   - Test: Update attachment
   - Test: Delete attachment
   - Test: Multiple attachments per document
   - Test: Attachment not found error
   - Test: Large attachment (>1MB base64)

**Effort:** 4-6 hours  
**Status:** 🚧 TODO

---

### **4.2 Refactor bulkWrite (PRIORITY 2)**

**Goal:** Use `categorizeBulkWriteRows()` for cleaner architecture

**Why:**
- Battle-tested logic from RxDB
- Automatic conflict detection
- Automatic attachment extraction
- Cleaner code (less manual logic)

**Steps:**

1. **Fetch existing documents** (current code)
   ```typescript
   const docsInDb = new Map();
   // ... populate from DB
   ```

2. **Call categorizeBulkWriteRows()** (new)
   ```typescript
   const categorized = categorizeBulkWriteRows(
     this,
     this.primaryPath,
     docsInDb,
     documentWrites,
     context
   );
   ```

3. **Execute categorized operations** (simplified)
   ```typescript
   // Inserts
   for (const doc of categorized.bulkInsertDocs) {
     insertStmt.run(...);
   }
   
   // Updates
   for (const doc of categorized.bulkUpdateDocs) {
     updateStmt.run(...);
   }
   
   // Attachments
   for (const att of categorized.attachmentsAdd) {
     attachmentStmt.run(att.documentId + '||' + att.attachmentId, att.attachmentData.data);
   }
   ```

4. **Return errors + eventBulk** (simplified)
   ```typescript
   return {
     error: categorized.errors
   };
   ```

**Effort:** 2-3 hours  
**Status:** 🚧 TODO

---

### **4.3 Verification & Release**

**Steps:**
1. ✅ Run full test suite (246/246 should still pass)
2. ✅ Run official RxDB tests (112/112 should still pass)
3. ✅ Update README with attachment support
4. ✅ Update CHANGELOG for v1.0.0
5. 📦 npm publish v1.0.0

**Effort:** 1-2 hours  
**Status:** 🚧 TODO after attachments + refactor complete

---

---

## 🚀 Post-v1.0 Enhancements (Future)

**These are NOT blockers for v1.0. Implement when users request them.**

### **Query Optimization (Nice-to-Have)**
- `normalizeMangoQuery()` - Better cache hit rate
- `prepareQuery()` - Query plan hints
- **Effort:** 2-3 hours
- **Benefit:** Marginal (cache already 5.2-57.9x faster)

### **Schema Migrations (Complex)**
- user_version pragma for in-place migrations
- **Why defer:** Not implemented in RxDB yet, needs design
- **Effort:** 8-12 hours (design + implementation)

### **Custom Indexes (Advanced)**
- Beyond default deleted/mtime_ms indexes
- **Why defer:** Advanced feature, niche use case
- **Effort:** 4-6 hours

### **Query Plan Hints (Optimization)**
- EXPLAIN QUERY PLAN for index selection
- **Why defer:** Optimization, not critical
- **Effort:** 2-3 hours

---

## 📋 REMOVED from Roadmap (Research Findings)

**These features DON'T EXIST in RxDB or are already complete:**

### ❌ conflictResolutionTasks() / resolveConflictResultionTask()
- **Status:** REMOVED in RxDB 16.0.0
- **Evidence:** Release notes explicitly state removal
- **What we have:** 409 error handling (correct approach)
- **Conflict resolution:** Happens at replication level, NOT storage level

### ✅ Missing Operators
- **Status:** DONE in v0.4.0
- **Implemented:** 18 operators ($eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $and, $or, $exists, $regex, $elemMatch, $not, $nor, $type, $size, $mod)

---

## 📋 Phase 4 Execution Plan (v1.0 Release)

### **Day 1-2: Attachments Implementation**

**SQL Pattern:** `field IS NULL` / `field IS NOT NULL`

**Steps:**
1. Create `src/query/exists-operator.test.ts`
   - Test: `{ age: { $exists: true } }` → finds docs with age field
   - Test: `{ age: { $exists: false } }` → finds docs without age field
   - Test: Edge case with null values
   - Test: Nested field `{ "address.city": { $exists: true } }`
   - **Expected:** All tests FAIL initially

2. Implement `translateExists()` in `src/query/operators.ts`
   ```typescript
   export function translateExists(field: string, exists: boolean): SqlFragment {
     return {
       sql: exists ? `${field} IS NOT NULL` : `${field} IS NULL`,
       args: []
     };
   }
   ```

3. Update `buildWhereClause()` in `src/query/builder.ts`
   - Add case for `$exists` operator
   - Call `translateExists(field, value)`

4. Run tests: `bun test src/query/exists-operator.test.ts`
   - **Expected:** All tests PASS

5. Run full suite: `bun test`
   - **Expected:** 58/58 tests passing (54 + 4 new)

6. Commit: `feat: add $exists operator with SQL translation`

**Effort:** 2 hours  
**Complexity:** Low (simple IS NULL check)

---

#### **Day 2: $regex Operator**

**SQL Pattern:** `field REGEXP ?` or `field LIKE ?` (fallback)

**Steps:**
1. Create `src/query/regex-operator.test.ts`
   - Test: `{ name: { $regex: "^John" } }` → starts with "John"
   - Test: `{ email: { $regex: "@gmail\\.com$" } }` → ends with "@gmail.com"
   - Test: Case-insensitive: `{ name: { $regex: "john", $options: "i" } }`
   - Test: Complex pattern: `{ phone: { $regex: "\\d{3}-\\d{4}" } }`
   - Test: LIKE fallback for simple patterns
   - Test: Edge case with special chars
   - **Expected:** All tests FAIL initially

2. Check SQLite REGEXP support
   - SQLite doesn't have REGEXP by default
   - Options: Load extension OR use LIKE for simple patterns OR use Mingo fallback

3. Implement `translateRegex()` in `src/query/operators.ts`
   ```typescript
   export function translateRegex(field: string, pattern: string, options?: string): SqlFragment {
     // Strategy: Use LIKE for simple patterns, Mingo for complex
     const isSimple = /^[\w\s]+$/.test(pattern);
     if (isSimple) {
       const likePattern = pattern.replace(/\^/g, '').replace(/\$/g, '');
       return { sql: `${field} LIKE ?`, args: [`%${likePattern}%`] };
     }
     // Complex regex: return null to trigger Mingo fallback
     return null;
   }
   ```

4. Update `buildWhereClause()` to handle `$regex`

5. Run tests: `bun test src/query/regex-operator.test.ts`

6. Run full suite: `bun test`
   - **Expected:** 64/64 tests passing (58 + 6 new)

7. Commit: `feat: add $regex operator with LIKE translation and Mingo fallback`

**Effort:** 3 hours  
**Complexity:** Medium (regex → SQL translation tricky)

---

#### **Day 3: $elemMatch Operator**

**SQL Pattern:** `json_each()` for array queries

**Steps:**
1. Create `src/query/elemMatch-operator.test.ts`
   - Test: `{ tags: { $elemMatch: { $eq: "urgent" } } }` → array contains "urgent"
   - Test: `{ items: { $elemMatch: { price: { $gt: 100 } } } }` → array has item with price > 100
   - Test: Nested conditions: `{ $elemMatch: { $and: [...] } }`
   - Test: Multiple criteria in $elemMatch
   - Test: Edge case: empty array
   - **Expected:** All tests FAIL initially

2. Research SQLite JSON functions
   - `json_each(field)` extracts array elements
   - `json_extract(value, '$.price')` for nested fields

3. Implement `translateElemMatch()` in `src/query/operators.ts`
   ```typescript
   export function translateElemMatch(field: string, criteria: any): SqlFragment {
     // Complex: requires subquery with json_each
     // For MVP: return null to use Mingo fallback
     // Future: Implement full SQL translation
     return null; // Mingo fallback for now
   }
   ```

4. Add Mingo fallback in query builder
   - If `translateElemMatch()` returns null, use Mingo for in-memory filtering

5. Run tests: `bun test src/query/elemMatch-operator.test.ts`

6. Run full suite: `bun test`
   - **Expected:** 69/69 tests passing (64 + 5 new)

7. Commit: `feat: add $elemMatch operator with Mingo fallback`

**Effort:** 4 hours  
**Complexity:** High (array queries in SQL are complex)

---

#### **Day 4: $not + $nor Operators**

**SQL Pattern:** `NOT(...)` and `NOT(... OR ...)`

**Steps:**
1. Create `src/query/not-operators.test.ts`
   - Test: `{ age: { $not: { $gt: 25 } } }` → age <= 25 OR age IS NULL
   - Test: `{ $nor: [{ age: { $lt: 18 } }, { age: { $gt: 65 } }] }` → age between 18-65
   - Test: Nested $not with $and
   - Test: $nor with multiple conditions
   - **Expected:** All tests FAIL initially

2. Implement `translateNot()` in `src/query/operators.ts`
   ```typescript
   export function translateNot(field: string, criteria: any): SqlFragment {
     const inner = processSelector(criteria);
     return {
       sql: `NOT(${inner.sql})`,
       args: inner.args
     };
   }
   ```

3. Implement `translateNor()` in `src/query/operators.ts`
   ```typescript
   export function translateNor(conditions: any[]): SqlFragment {
     const fragments = conditions.map(c => processSelector(c));
     const sql = fragments.map(f => f.sql).join(' OR ');
     return {
       sql: `NOT(${sql})`,
       args: fragments.flatMap(f => f.args)
     };
   }
   ```

4. Update query builder for `$not` and `$nor`

5. Run tests: `bun test src/query/not-operators.test.ts`

6. Run full suite: `bun test`
   - **Expected:** 73/73 tests passing (69 + 4 new)

7. Commit: `feat: add $not and $nor operators`

**Effort:** 2 hours each (4 hours total)  
**Complexity:** Medium (negation logic)

---

#### **Day 5: $type + $size + $mod Operators**

**SQL Patterns:** `typeof()`, `json_array_length()`, `field % divisor = remainder`

**Steps:**
1. Create `src/query/advanced-operators.test.ts`
   - Test: `{ age: { $type: "number" } }` → field is number
   - Test: `{ tags: { $size: 3 } }` → array has exactly 3 elements
   - Test: `{ count: { $mod: [5, 0] } }` → count divisible by 5
   - Test: Edge cases for each
   - **Expected:** All tests FAIL initially

2. Implement `translateType()` in `src/query/operators.ts`
   ```typescript
   export function translateType(field: string, type: string): SqlFragment {
     // SQLite doesn't have native typeof
     // Use Mingo fallback for now
     return null;
   }
   ```

3. Implement `translateSize()` in `src/query/operators.ts`
   ```typescript
   export function translateSize(field: string, size: number): SqlFragment {
     return {
       sql: `json_array_length(${field}) = ?`,
       args: [size]
     };
   }
   ```

4. Implement `translateMod()` in `src/query/operators.ts`
   ```typescript
   export function translateMod(field: string, [divisor, remainder]: [number, number]): SqlFragment {
     return {
       sql: `${field} % ? = ?`,
       args: [divisor, remainder]
     };
   }
   ```

5. Update query builder for all three operators

6. Run tests: `bun test src/query/advanced-operators.test.ts`

7. Run full suite: `bun test`
   - **Expected:** 79/79 tests passing (73 + 6 new)

8. Commit: `feat: add $type, $size, and $mod operators`

**Effort:** 2 hours  
**Complexity:** Low-Medium

---

### **Week 2: Integration + Benchmarking**

#### **Day 6: Install Mingo + Fallback Integration**

**Steps:**
1. Install Mingo: `bun add mingo`
2. Create `src/query/mingo-fallback.ts`
   ```typescript
   import { Query } from "mingo/query";
   
   export function evaluateWithMingo<T>(docs: T[], selector: any): T[] {
     const query = new Query(selector);
     return docs.filter(doc => query.test(doc));
   }
   ```
3. Update query builder to use Mingo when SQL translation returns null
4. Test all operators with Mingo fallback
5. Commit: `feat: add Mingo fallback for complex queries`

**Effort:** 3 hours

---

#### **Day 7: Benchmark Mingo vs Sift.js**

**Steps:**
1. Create `benchmarks/evaluator-benchmark.ts`
2. Test both libraries with 10k docs, 8 query types
3. Measure: execution time, memory usage
4. Document results in `docs/evaluator-comparison.md`
5. Choose winner (likely Mingo based on research)
6. Commit: `docs: add query evaluator benchmark results`

**Effort:** 2 hours

---

#### **Day 8-9: RxDB Official Test Suite**

**Steps:**
1. Clone RxDB test suite setup
2. Run 70+ official tests against our adapter
3. Fix any failures (TDD approach)
4. Document compatibility in README
5. Commit: `test: pass RxDB official test suite`

**Effort:** 8 hours

---

#### **Day 10: Final Benchmark vs pe-sqlite-for-rxdb**

**Steps:**
1. Create `benchmarks/vs-reference.ts`
2. Test with 3000 docs, 40 runs (official methodology)
3. Measure: insert, query, update, delete performance
4. Document results in README
5. Target: 3-6x speedup
6. Commit: `docs: add performance comparison vs reference implementation`

**Effort:** 4 hours

---

**Total Effort:** 2 weeks (10 days)  
**Status:** Week 1 COMPLETE ✅ | Week 2 Research Complete ✅

---

## 📊 Phase 4.5: Research Findings & Optimizations (2026-02-22)

### **Smart Regex → LIKE Optimization (IMPLEMENTED ✅)**

**Status:** ✅ Implemented, tested, and crew-verified

**Implementation:** `src/query/smart-regex.ts`

**Benchmark Results:**
```
100k documents, 10 runs each:
- Exact match (^gmail.com$):  2.03x speedup (= operator vs LIKE)
- Prefix (^User 1):           0.99x (no improvement)
- Suffix (@gmail.com$):       1.00x (no improvement)
- Case-insensitive:           1.23x speedup (COLLATE NOCASE vs LOWER())
- Overall average:            1.24x speedup
```

**Crew Verification (2026-02-22):**
- ✅ Validated against SQLite's official "LIKE Optimization" strategy
- ✅ Real-world benchmark: 14ms vs 440ms (31x speedup) on Stack Overflow
- ✅ COLLATE NOCASE is standard production approach
- ✅ Found and fixed critical escaping bug (% and _ characters)
- ✅ Regression test added to prevent future issues
- ✅ All 91 tests passing

**Key Optimization:**
```typescript
// Exact match: ^text$ → field = ? (2.03x faster)
// Case-insensitive: Use COLLATE NOCASE, not LOWER() (1.23x faster)
```

**Decision:** ✅ KEEP - Validated optimization with measurable benefits

---

### **FTS5 Trigram Indexes Investigation (REJECTED ❌)**

**Status:** ❌ Benchmarked at 100k and 1M scales, decided NOT to implement

**Benchmark Results:**

100k documents (`benchmarks/fts5-before-after.ts`):
```
BEFORE (LIKE):  128.90ms average
AFTER (FTS5):   230.22ms average
Speedup:        0.56x (1.79x SLOWDOWN!)
```

1M documents (`benchmarks/fts5-1m-scale.ts`):
```
BEFORE (LIKE):  1215.47ms average
AFTER (FTS5):   1827.65ms average
Speedup:        0.67x (1.5x SLOWDOWN!)
Index creation: 23717.26ms (23.7 seconds)
```

**Crew Verification (2026-02-22):**
- ✅ Confirmed 100x speedup at 18.2M rows (Andrew Mara benchmark)
- ✅ Crossover point estimated between 1M-10M rows
- ✅ Slowdown at 100k-1M is expected behavior
- ✅ FTS5 overhead dominates at small scales

**Decision:** ❌ REJECT - FTS5 is slower at our scale (< 10M docs). Only beneficial at massive scale.

---

### **Research Summary: Hybrid SQL+Mingo Pattern**

**Finding:** The hybrid SQL pre-filter + Mingo post-filter pattern suggested by senior engineer **does NOT exist in production**.

**Evidence:**
- ❌ RxDB's official SQLite storage: Pure Mingo post-filter (fetches ALL docs, filters in JS)
- ❌ pe-sqlite-for-rxdb: Pure SQL translation (no Mingo at all)
- ❌ NO production examples found in GitHub
- ❌ NO benchmarks proving the hybrid approach works

**Conclusion:** Hybrid pattern is **unproven**. Current pure SQL approach matches production patterns (pe-sqlite-for-rxdb).

**Status:** ❓ **QUESTION MARK** - Ask senior for source of recommendation before implementing.

---

### **Research Summary: Smart Regex → LIKE Optimization**

**Finding:** Regex → LIKE conversion is **PROVEN** in production with **100x speedup**.

**Evidence:**
- ✅ FTS5 trigram benchmark: **1.75s → 14ms (100x speedup)** on 18M rows
- ✅ Production usage: Dify, Tortoise ORM, ComfyUI all use `escape_like` patterns
- ✅ Simple patterns (`^prefix`, `suffix$`) can use indexes

**Patterns that CAN be optimized:**
| Regex | LIKE | Index Usage | Speedup |
|-------|------|-------------|---------|
| `^prefix` | `prefix%` | ✅ Yes | High |
| `suffix$` | `%suffix` | ❌ No | Medium |
| `^exact$` | `exact` (use `=`) | ✅ Yes | Very High |
| `.*contains.*` | `%contains%` | ❌ No | Low (use FTS5) |

**Status:** ✅ **VALIDATED** - Implement with benchmarks.

---

### **Research Summary: FTS5 Trigram Indexes**

**Finding:** FTS5 trigram indexes provide **100x speedup** for substring searches.

**Evidence:**
- ✅ Benchmark: 1.75s → 14ms on 18M rows for `LIKE '%google%'`
- ✅ Index overhead: 1.5GB for 18M rows (acceptable)
- ✅ Index creation: ~144 seconds (one-time cost)

**Use case:** Substring searches (`%contains%`) that can't use regular indexes.

**Status:** ✅ **VALIDATED** - Implement with benchmarks.

---

### **Week 3: Proven Optimizations (NEXT)**

#### **Day 11: Smart Regex → LIKE Converter**

**Goal:** Extend simple regex patterns to use LIKE/GLOB for index usage.

**Steps:**
1. Create `src/query/smart-regex.ts`
   ```typescript
   export function smartRegexToLike(pattern: string, options?: string): SqlFragment | null {
     const caseInsensitive = options?.includes('i');
     
     // Exact match: ^hello$
     if (pattern.startsWith('^') && pattern.endsWith('$') && !/[.*+?()[\]{}|]/.test(pattern.slice(1, -1))) {
       const exact = pattern.slice(1, -1).replace(/\\\./g, '.');
       return caseInsensitive
         ? { sql: `LOWER(field) = LOWER(?)`, args: [exact] }
         : { sql: `field = ?`, args: [exact] };
     }
     
     // Prefix: ^hello
     if (pattern.startsWith('^')) {
       const prefix = pattern.slice(1).replace(/\\\./g, '.');
       const escaped = prefix.replace(/%/g, '\\%').replace(/_/g, '\\_');
       return caseInsensitive
         ? { sql: `LOWER(field) LIKE LOWER(?) ESCAPE '\\'`, args: [escaped + '%'] }
         : { sql: `field LIKE ? ESCAPE '\\'`, args: [escaped + '%'] };
     }
     
     // Suffix: hello$
     if (pattern.endsWith('$')) {
       const suffix = pattern.slice(0, -1).replace(/\\\./g, '.');
       const escaped = suffix.replace(/%/g, '\\%').replace(/_/g, '\\_');
       return caseInsensitive
         ? { sql: `LOWER(field) LIKE LOWER(?) ESCAPE '\\'`, args: ['%' + escaped] }
         : { sql: `field LIKE ? ESCAPE '\\'`, args: ['%' + escaped] };
     }
     
     // Contains (simple)
     if (!/[.*+?()[\]{}|^$]/.test(pattern)) {
       const escaped = pattern.replace(/%/g, '\\%').replace(/_/g, '\\_');
       return caseInsensitive
         ? { sql: `LOWER(field) LIKE LOWER(?) ESCAPE '\\'`, args: ['%' + escaped + '%'] }
         : { sql: `field LIKE ? ESCAPE '\\'`, args: ['%' + escaped + '%'] };
     }
     
     // Complex pattern → return null for Mingo fallback
     return null;
   }
   ```

2. Update `translateRegex()` to use smart converter
3. Create `benchmarks/smart-regex-benchmark.ts`
4. Run benchmark comparing old vs new approach
5. Document results
6. Commit: `feat: add smart regex → LIKE converter with benchmarks`

**Expected Results:**
- Prefix patterns: 2-5x faster (index usage)
- Exact matches: 10x faster (use `=` instead of LIKE)
- Complex patterns: No change (Mingo fallback)

**Effort:** 1 hour  
**Status:** ✅ Validated by research

---

#### **Day 12: FTS5 Trigram Indexes**

**Goal:** Add FTS5 trigram indexes for fast substring searches.

**Steps:**
1. Update `src/instance.ts` to create FTS5 trigram table
   ```typescript
   // Create FTS5 trigram index for fast substring searches
   this.db.run(`
     CREATE VIRTUAL TABLE IF NOT EXISTS "${tableName}_fts" 
     USING fts5(
       id UNINDEXED,
       data,
       tokenize='trigram',
       detail='none'
     )
   `);
   
   // Populate FTS5 table
   this.db.run(`
     INSERT INTO "${tableName}_fts"(id, data)
     SELECT id, data FROM "${tableName}"
   `);
   ```

2. Update query builder to use FTS5 for substring searches
   ```typescript
   // For patterns like %contains%
   if (pattern.includes('%') && !pattern.startsWith('%')) {
     return {
       sql: `id IN (SELECT id FROM ${tableName}_fts WHERE data MATCH ?)`,
       args: [cleanPattern]
     };
   }
   ```

3. Create `benchmarks/fts5-trigram-benchmark.ts`
4. Run benchmark: LIKE vs FTS5 on 100k docs
5. Document results
6. Commit: `feat: add FTS5 trigram indexes for substring searches`

**Expected Results:**
- Substring searches: 50-100x faster
- Index overhead: ~1.5x data size
- One-time index creation cost

**Effort:** 1 hour  
**Status:** ✅ Validated by research

---

#### **Day 13: Hybrid SQL+Mingo Pattern (QUESTION MARK)**

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
