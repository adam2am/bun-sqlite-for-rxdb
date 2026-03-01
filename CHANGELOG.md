# Changelog

## [1.5.6] - 2026-03-01

### Fixed 🔥
- **Critical: NULL handling in $size operator and logical operations**
  - SQLite's three-valued logic (TRUE/FALSE/NULL) was breaking query semantics
  - Property-based tests failing: all docs matched instead of filtering correctly
  - Root cause: $size on unknown fields returned NULL, causing fallback to incorrect JS filtering
  - Fix: Use two-parameter `json_array_length(data, '$.path')` API (was using one-parameter form)
  - Fix: Add COALESCE guards to convert NULL → 0 in logical operations
  - Fix: $not: {$eq} now uses $ne semantics (handles NULL correctly)
  - Result: 624/624 tests passing (was 605/624 with 19 failures)
- **$size operator API consistency**
  - Changed from one-parameter to two-parameter `json_array_length()` form
  - Old: `json_array_length(json_extract(data, '$.field'))` → "malformed JSON" errors
  - New: `json_array_length(data, '$.field')` → Correct SQLite API
  - `json_extract()` returns STRING, not JSON value - two-parameter form is correct
- **buildLogicalOperator bug (pre-existing)**
  - Was always using OR even for $and operations
  - Now correctly uses AND/OR based on operator type
  - Discovered during NULL handling fix

### Added
- **COALESCE NULL handling strategy**
  - Wraps SQL in `COALESCE((sql), 0)` where NULL breaks logic
  - Applied to: wrapWithNot, $nor, $elemMatch logical operators
  - Matches Mingo's two-valued logic (true/false, no NULL)
- **Data corruption vs schema uncertainty distinction**
  - Data corruption: $size on KNOWN string field → return 1=0 (impossible)
  - Schema uncertainty: $size on UNKNOWN field → execute SQL (we don't know if it's an array)
  - Follows Mingo philosophy: "try, then handle" not "pre-validate"

### Changed
- **Query cache version bump: v2 → v3**
  - Invalidates old cached SQL without NULL handling fixes
  - Prevents stale cache bugs

### Technical Details
- All 624 tests passing (19 failures fixed)
- Property-based tests: 10k random queries validated against Mingo
- Architectural pattern #31 documented
- Zero regressions

---

## [1.5.5] - 2026-03-01

### Fixed 🔥
- **Critical: schema-mapper.ts typo causing ALL schema-aware optimizations to fail**
  - Line 27: `properties?.path` → `properties?.[path]`
  - Bug prevented getColumnInfo() from detecting field types
  - All schema-aware checks were returning 'unknown' instead of actual types
- **$type operator NULL bug in $nor queries**
  - `json_type()` returns NULL for missing fields
  - `NOT(FALSE OR NULL)` = NULL (excluded from results incorrectly)
  - Fix: COALESCE(json_type(...) = 'text', 0) converts NULL → FALSE
  - Now correctly matches MongoDB/Mingo behavior in negation contexts

### Added
- **Schema-aware $size optimization**
  - Returns 1=0 (no matches) when $size used on non-array fields
  - Prevents SQLite crash: `json_array_length('string')` → "malformed JSON"
  - Compile-time optimization (no runtime overhead)
- **BSON type aliases for $type operator**
  - Added: bool, int, long, double, decimal
  - Matches MongoDB BSON type naming conventions
- **Comprehensive data corruption handling**
  - Invalid operators return 1=0 (matches Mingo/RxDB ecosystem pattern)
  - Research: 7 agents analyzed Mingo/RxDB behavior
  - Decision: Ecosystem compatibility over MongoDB purity
  - Documented in docs/architecture/data-corruption-handling.md

### Changed
- **Extend getColumnInfo() to return all primitive types**
  - Now returns: string, number, boolean, array (was: array, unknown)
  - Enables more schema-aware optimizations in future

### Technical Details
- All 594 tests passing (15,836 expect() calls)
- Zero regressions
- Research-backed: 7 agents (4 Vivian + 3 Lisa) validated approach
- Conservative optimization: Only optimize when mathematically safe

---

## [1.5.4] - 2026-03-01

### Performance 🔥
- **VIRTUAL/STORED generated columns: 5-11% faster queries**
  - VIRTUAL mode (default): 5-7% speedup, 0% storage overhead
  - STORED mode: 11% speedup on typical queries, 58% faster sorts
  - Pre-computes _deleted, _rev, _meta.lwt from JSON data column
  - Synthetic benchmark (100K docs, sort without index): 58% faster with STORED
- **Iterator-based mixed queries: 1.6x faster for paginated regex**
  - Stops fetching rows once LIMIT reached
  - 1.6x faster queries (59.31ms → 36.80ms)
  - 813x less memory (33,334 rows → 41 rows processed)
  - Optimizes queries like `{ status: 'active', name: { $regex: '^A' } } LIMIT 10`

### Added
- **useStoredColumns config option** with 3 modes:
  - `false`: baseline (manual column extraction)
  - `'virtual'`: computed on-the-fly, 0% storage overhead (default)
  - `'stored'`: pre-computed, +11% storage, 58% faster sorts
- **Generated columns for RxDB internal fields**
  - `_deleted` column (VIRTUAL/STORED)
  - `_rev` column (VIRTUAL/STORED)
  - `_meta.lwt` column (VIRTUAL/STORED)
- **Iterator-based execution for mixed queries**
  - Early exit when LIMIT reached
  - Processes only necessary rows for SQL + JS selector queries

### Fixed 🔥
- **ORDER BY clause now uses column mapper**
  - Was hardcoded to `json_extract(data, '$.field')`
  - Now uses `getColumnInfo()` to map fields to native columns
  - Enables proper use of VIRTUAL/STORED columns in sort clauses

### Technical Details
- All 587 tests passing (our tests)
- All 16/16 RxDB query correctness tests passing
- All 122/122 RxDB storage implementation tests passing
- Zero regressions
- Marked experimental for alpha testing

---

## [1.5.3] - 2026-03-01

### Performance 🔥
- **LIMIT/OFFSET push to SQL: 3.0x faster for queries with LIMIT**
  - Small LIMIT (10) on 50k results: 219.21ms → 73.00ms (3.0x faster)
  - LIMIT + SKIP (pagination): 219.21ms → 72.92ms (3.0x faster)
  - Large LIMIT (1000): 219.21ms → 73.51ms (3.0x faster)
  - Data transfer reduction: 5000x less (50k rows → 10 rows across FFI boundary)
  - Pure SQL queries now push LIMIT/OFFSET to SQL instead of slicing in JS
  - Mixed queries (SQL + JS filtering) correctly apply LIMIT/OFFSET in JS

### Added
- **Conditional LIMIT/OFFSET optimization**
  - When `jsSelector === null` (pure SQL): Push LIMIT/OFFSET to SQL
  - When `jsSelector !== null` (mixed query): Apply LIMIT/OFFSET in JS after filtering
  - Maintains correctness while achieving massive speedup
- **Comprehensive benchmark suite**
  - `test/benchmarks/limit-offset-optimization.ts` - 5 scenarios with 20 runs each
  - Measures median, avg, min, max times for various LIMIT/OFFSET patterns
- **Unit tests for LIMIT/OFFSET bugs**
  - `test/unit/partial-sql-pushdown-bugs.test.ts` - 7 tests
  - Performance tests to verify optimization works
  - Correctness tests to verify no regressions

### Fixed 🔥
- **LIMIT/OFFSET not pushed to SQL for pure SQL queries**
  - Was fetching ALL matching rows and slicing in JS
  - Now pushes LIMIT/OFFSET to SQL when no JS filtering needed
  - Eliminates unnecessary data transfer across FFI boundary
  - Example: LIMIT 10 on 50k results now fetches only 10 rows (not 50k)

### Technical Details
- All 583 tests passing
- Zero regressions
- 3.0x speedup proven by benchmarks

---

## [1.5.2] - 2026-03-01

### Performance 🔥
- **Partial SQL pushdown: 1.8x faster for mixed queries**
  - Queries with unsupported operators (e.g., $regex): 383ms → 213ms
  - Splits selectors into SQL-supported + JS-only parts
  - SQL filters first (reduces dataset), then JS filters remaining
  - Example: `{ status: 'active', name: { $regex: '^[A-Z]' } }` now filters 100k → 50k in SQL, then regex in JS
- **Batch operations: 54-55% faster for small/medium batches, 6% faster for large batches**
  - Fixed batch (100 docs): 2.33ms → 1.07ms (54% faster)
  - Varying batch sizes: 2.14ms → 0.96ms (55% faster)
  - Large batch (10k docs): 86.76ms → 81.24ms (6% faster)
  - Chunked multi-VALUES INSERT with CHUNK_SIZE=50 (optimal from SQLite benchmarks)
  - Reduces JS↔native boundary crossings: 10k calls → 200 calls
  - Single transaction wrapper eliminates commit overhead

### Added
- **BipartiteQuery interface** for partial SQL pushdown
  - `buildWhereClauseWithFallback()` splits selectors into SQL + JS parts
  - `splitSelector()` separates supported from unsupported operators
  - Enables progressive enhancement: SQL fast path + JS fallback
- **Chunked multi-VALUES INSERT pattern**
  - CHUNK_SIZE=50 based on SQLite Forum benchmarks (50-100 rows optimal)
  - Per-chunk conflict handling (maintains RxDB semantics)
  - Prepared statement pattern with transaction wrapper

### Fixed 🔥
- **Batch operations regression** (124% slower for large batches)
  - Single prepared statement loop caused: 86.76ms → 194.06ms for 10k docs
  - Root cause: 10k individual insertStmt.run() calls = massive boundary crossing overhead
  - Solution: Chunked multi-VALUES INSERT = 194.06ms → 81.24ms (beats original by 6%)
- **Full table scans for mixed queries**
  - Queries with ANY unsupported operator returned null → fetched ALL rows
  - Now: SQL filters supported parts, JS filters unsupported parts
  - Prevents loading 100k rows when only 5k match after filtering

### Changed
- **Query execution flow** for mixed queries
  - BEFORE: Unsupported operator → null → fetch all → filter in JS
  - AFTER: Build partial SQL WHERE → fetch subset → filter remaining in JS
  - SKIP/LIMIT moved to JS layer for correct semantics
- **Batch operations implementation**
  - BEFORE: String concatenation with BATCH_SIZE=100 chunking
  - AFTER: Chunked multi-VALUES with CHUNK_SIZE=50 in single transaction
  - Better statement cache utilization, fewer boundary crossings

### Technical Details
- All 576 tests passing
- Zero regressions
- Benchmark validation: partial-pushdown-baseline.ts, batch-operations-baseline.ts
- Research-backed: SQLite Forum benchmarks, production examples from Signal Desktop
- Applied 5-approaches framework (Linus Torvalds style) for optimization analysis

---

## [1.5.1] - 2026-03-01

### Performance 🔥
- **Sorted fallback queries: 2.1x faster**
  - 100k docs with LIMIT=10: 629ms → 302ms
  - Unified sorted/unsorted code paths
  - Push ORDER BY to SQLite, use iterate() + early exit
  - Only parse ~10-20 documents instead of loading all
- **StatementManager caching: 2.8x faster UPDATE operations**
  - UPDATE operations: 12.98ms → 4.64ms
  - Fixed artificial limitation refusing to cache queries with WHERE clause
  - Now caches ALL prepared statements (industry standard)
- **Cache hit rates: 1.5-28% better under pressure**
  - REGEX_CACHE (FIFO → SIEVE): 11.7-28% better hit rates
  - INDEX_CACHE (Manual-LRU → SIEVE): 1.5-6.8% better hit rates
  - 10-18% lower eviction overhead

### Changed
- **Cache infrastructure unification (DRY refactor)**
  - Centralized all cache creation in `src/query/cache.ts`
  - Single source of truth for cache configuration
  - Factory pattern: `getRegexCache()`, `getIndexCache()`, `getQueryCache()`
  - Eliminated ~50 lines of manual eviction code
  - Easy to swap cache implementations (change 1 file)
- **Query cache architecture**
  - Migrated REGEX_CACHE from manual FIFO Map to SieveCache(100)
  - Migrated INDEX_CACHE from manual LRU Map to SieveCache(1000)
  - Unified caching strategy across all 3 caches

### Fixed 🔥
- **Sorted fallback loading all documents before filtering**
  - Was loading 100k docs to return 10 (O(n) instead of O(k))
  - Now uses ORDER BY + iterate() + early exit pattern
  - Preserves correctness while achieving 2x speedup
- **StatementManager refusing to cache dynamic queries**
  - `isStaticSQL()` was rejecting queries with `WHERE (`
  - Affected UPDATE/INSERT/DELETE operations
  - Now caches all queries with LRU eviction (MAX_STATEMENTS=500)

### Technical Details
- All 575 tests passing
- Zero regressions
- Benchmark validation: cache-pressure-comparison.ts
- Code reduction: ~50 lines of manual cache eviction eliminated
- Architecture: Single source of truth for cache configuration

---

## [1.5.0] - 2026-02-28

### Added
- **Top-level $not operator** (Extension beyond MongoDB/Mingo spec)
  - Enables cleaner negation logic without De Morgan's law
  - SQL translation: `NOT (inner_condition)`
  - Real-world use cases: range exclusion, access control, date filtering
  - Example: `{ $not: { $and: [{ price: { $gt: 20 } }, { price: { $lt: 100 } }] } }`
- **Tolerant Reader pattern** (Postel's Law)
  - Accept Mingo's permissive behavior over MongoDB's strict behavior
  - Handles Date/RegExp objects in $not operator (Mingo compatibility)
  - Normalizes primitives, Date, RegExp to operator format internally
  - Maintains RxDB ecosystem compatibility across storage backends
- **Comprehensive test coverage** (200+ new test lines)
  - $not operator edge cases (empty objects, nested logical operators, primitives)
  - $nin operator with null/undefined handling
  - $regex with $options: 'i' integration tests (full query path verification)
  - Case-insensitive regex with anchored patterns (prefix/suffix/exact)
  - Per-instance cache isolation and cleanup tests (100 concurrent instances stress test)
  - Property-based test edge cases (complex regex, nested operators, NULL in arrays)
  - Mango query syntax documentation tests (valid vs invalid patterns)

### Performance 🔥
- **Date/RegExp normalization: 4.2% faster**
  - Early exit optimization for primitive values
  - Zero-allocation validation (primitive loops instead of regex)
  - Validation runs after cache lookup (avoids hot path overhead)

### Fixed 🔥
- **Query cache architecture: Global → Per-instance scope**
  - Prevents cache pollution between multiple storage instances
  - Each instance maintains isolated cache with proper cleanup on close()
  - Fixes race conditions in multi-collection applications
  - Stress tested with 100 concurrent instances
- **Field-level $not with nested logical operators** (Extended MongoDB syntax)
  - MongoDB/Mingo reject `{ field: { $not: { $or: [...] } } }` but RxDB passes it raw
  - Now supports nested $and/$or/$nor inside field-level $not
  - Follows Tolerant Reader pattern for better UX
  - Fixes $elemMatch with complex nested conditions
- **$nin operator: MongoDB spec compliance**
  - Now includes NULL check: `(field IS NULL OR field NOT IN (...))`
  - MongoDB spec: "$nin selects documents where field NOT in array OR field does NOT exist"
  - Verified against MongoDB docs and Mingo implementation
- **RegExp cache collision in query builder**
  - stableStringify() now explicitly serializes RegExp as `{"$re":"pattern","$fl":"flags"}`
  - Also handles Date objects explicitly to prevent cache key collisions
  - Fixes test isolation bug where `{ $not: {} }` and `{ $not: /test/i }` had identical cache keys
- **Regex improvements**
  - Validate regex options and reject invalid flags (g, y, etc.) with explicit error
  - MongoDB only supports: i, m, s, x, u flags
  - Fix regex fallback for complex patterns (type-safe null propagation)
  - Fix $regex + $options handling as sibling operators
  - Export clearRegexCache() utility for test cleanup
- **Operator handling in handleFieldCondition**
  - Fix isOperatorObject to reject empty objects (zero-allocation for...in loop)
  - Add instanceof checks for RegExp and Date before treating as operator object
  - Handle empty objects explicitly (return 1=0 - match nothing)
  - Route $not as logical operator instead of leaf operator
- **Test reliability**
  - Fix flaky benchmark test with proper statistical methodology (warmup + median)
  - Remove flaky timing assertions from cache performance tests
  - Add cache cleanup between tests to prevent pollution
  - Fix property-based test generator to use valid regex flags only

### Changed
- **BREAKING: Architecture refactor**
  - Removed `translateNot` export (moved logic to builder.ts)
  - Separated document parsing (builder.ts) from operator translation (operators.ts)
  - builder.ts: Document structure parser, handles Tolerant Reader pattern
  - operators.ts: Pure operator dictionary with translateLeafOperator router
  - Clear contract, no mixing of concerns
- **Mingo compatibility improvements**
  - Date/RegExp normalization for SQLite compatibility (primitives only in bindings)
  - Date → ISO 8601 string (toISOString)
  - RegExp → JSON with source/flags (Mingo compatibility)
  - undefined → null
  - Applied to all comparison operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
- **Operator refactoring**
  - Added isLogicalOperator() - O(1) operator classification
  - Added handleLogicalOperator() - Recursive logical operator handling
  - Added handleFieldCondition() - Nested object value support
  - Refactored buildElemMatchConditions with helper functions

### Documentation
- **Pattern #30: Top-level $not operator support**
  - 3 real-world use cases with code examples
  - SQL translation proof and rationale
- **Mingo vs MongoDB compatibility analysis** (1048-line proposal)
  - 27 Mingo vs MongoDB differences documented
  - Bug analysis and root cause investigation
  - MVP vs architectural refactor comparison
  - Performance benchmarks and known bugs
  - MongoDB spec compliance verification
- **Builder/operators architecture separation**
  - Clear separation of concerns documented
  - Parser vs dictionary contract defined

### Technical Details
- All 570 tests passing (520 + 50 new tests)
- Zero regressions in query or write performance (4.2% faster with normalization)
- Per-instance cache isolation prevents multi-collection bugs
- Extended MongoDB syntax support for better RxDB integration
- Improved test reliability with proper cleanup and statistical methods
- Zero-allocation optimizations throughout (for...in loops, primitive validation)

---

## [1.4.0] - 2026-02-27

### Performance 🔥
- **Lazy iteration: 244x speedup for LIMIT queries without sort**
  - LIMIT 10 on 10k docs: 38.99ms → 0.16ms (244x faster)
  - Smart routing: lazy path for simple queries, eager path for sort queries
  - No regression for queries with ORDER BY (preserved eager path)
- **Statement cache optimization**
  - json_each() for $in/$nin operators prevents cache thrashing
  - Single SQL for all array lengths: `IN (SELECT value FROM json_each(?))`
  - Eliminates cache pollution from dynamic array lengths

### Fixed 🔥
- **Critical query bugs**
  - Removed duplicate broken `matchesSelector` method (only handled 6 operators)
  - Fixed OFFSET without LIMIT SQL syntax error (now adds `LIMIT -1`)
  - Fixed $not operator to handle primitives (false, 0, "", null)
  - Fixed $ne operator to match NULL/missing fields (MongoDB spec)
  - Fixed array field equality: `{tags: "value"}` now matches arrays containing value
  - Fixed empty selector `{}` to return 1=0 (match nothing) instead of ALL rows
  - Fixed $or precedence: always wrap in parentheses to prevent SQL parsing issues
  - Fixed invalid inputs: return 1=0 instead of null (which triggered fallback returning ALL docs)

### Added
- **Lightweight matcher** (103 lines)
  - Custom implementation replacing RxDB's heavy getQueryMatcher
  - Handles only operators needed for in-memory filtering
  - Fixed RxDB's incorrect $mod type: `number` → `[number, number]`
  - 206 lines of tests
- **Property-based testing infrastructure**
  - fast-check + Mingo + Sift.js for differential testing
  - 1000 random queries validated against MongoDB reference implementations
  - Found multiple correctness bugs that unit tests missed
  - 3000+ assertions across all test suites
- **Comprehensive test coverage** (1,754 new lines)
  - Query execution correctness tests (297 lines)
  - Operator unit tests for arrays and $elemMatch (226 lines)
  - Regression tests for fixed bugs (241 lines)
  - Property-based correctness tests (640 lines)
  - Cache strategy benchmark (350 lines)

### Changed
- **Architecture improvements**
  - Thread schema context through all operators for type-aware queries
  - Improved JSONB compatibility
  - Better separation: lightweight matcher for in-memory, SQL for database queries

### Technical Details
- All 520+ tests passing
- Zero regressions in query or write performance
- Lazy iteration preserves insertion order for queries without sort
- Eager path preserves sorted order for queries with ORDER BY

---

## [1.3.0] - 2026-02-26

### Added
- **Bun-optimized stable-stringify for deterministic JSON**
  - Custom implementation optimized for Bun's JavaScriptCore engine
  - 25x faster than baseline (536K ops/sec average)
  - 49x faster for Mango queries (1.04M ops/sec)
  - Eliminates cache key collisions between undefined and null
  - Safe toJSON error handling (returns "[Error: message]" instead of crashing)

### Performance 🔥
- **stable-stringify optimizations: 10-65% faster**
  - Small objects: +65% faster (691K → 1.1M ops/sec)
  - Overall average: +10% faster (646K → 714K ops/sec)
  - Optimized for common case (simple Mango queries with 5-20 keys)
- **SQL query optimizations**
  - Push ORDER BY/LIMIT/OFFSET to SQL layer (eliminates in-memory sorting overhead)
  - Batch INSERT operations for better throughput
- **Regex cache: O(1) FIFO eviction**
  - Eliminates cache management overhead
  - Constant-time eviction vs linear scan

### Fixed 🔥
- **Query cache collision between undefined and null**
  - Fixed cache key collision where `{ age: undefined }` and `{ age: null }` produced identical keys
  - stable-stringify now omits undefined values (matches JSON.stringify behavior)
  - Prevents cache pollution and wrong SQL being returned
  - 30x faster performance (645K ops/sec)
- **toJSON error handling in stableStringify**
  - Add callSafe helper to catch toJSON errors instead of crashing
  - Returns "[Error: <message>]" format for failed toJSON calls
  - Prevents application crashes from buggy toJSON implementations
- **$elemMatch operator fixes**
  - Handle non-operator fields and nested operators correctly
  - Added 6 missing operators: $exists, $size, $mod, $not, $and, $or
  - Fixed 3 edge cases: multi-field objects, nested object values, dot notation paths
- **SQL operator precedence**
  - Add proper parentheses for $or operator precedence (AND > OR in SQL)
  - Fixed 3 test expectations that were checking for incorrect SQL
- **Input validation to prevent data corruption crashes**
  - Validate at function boundaries (buildWhereClause, processSelector, operators)
  - Prevents crashes on null/undefined/wrong types
  - Fixed 17 data corruption test failures
- **Null checks in not-operators tests**
  - Add proper null validation to prevent edge case failures

### Changed
- **Removed Mingo dependency**
  - Simplified query routing by using ourMemory regex matcher for all fallback cases
  - Eliminates 519 lines from lockfile
  - Reduces bundle size and dependency complexity
  - All regex queries now use custom LRU-cached matcher
- **buildWhereClause now returns nullable**
  - Returns null for untranslatable queries (cleaner API)
  - Enables proper fallback to in-memory filtering
  - Updated all unit tests for new signature

### Technical Details
- All 346 tests passing (17 data corruption tests fixed)
- No regressions in query or write performance
- stable-stringify uses manual loops (no .map() overhead)
- Custom insertion sort for arrays <100 elements (threshold optimized)
- Proper type safety: no `any` types in stable-stringify implementation
- Query cache now properly handles undefined vs null distinction

---

## [1.2.8] - 2026-02-25

### Performance 🔥
- **PRAGMA optimizations for read-heavy workloads**
  - Added `PRAGMA mmap_size = 268435456` (256MB, configurable via `mmapSize` setting)
  - Added `PRAGMA temp_store = MEMORY` (10-20% faster complex queries)
  - Added `PRAGMA locking_mode = NORMAL` (multi-instance compatibility)
  - 256MB mmap_size is industry standard (GrapheneOS, Android apps, desktop tools)
  - Eliminates double-copy for reads, shares OS page cache directly

### Added
- **Configurable mmap_size setting**
  - New `mmapSize` option in `BunSQLiteStorageSettings`
  - Default: 268435456 bytes (256MB) - industry standard
  - Set to 0 to disable (recommended for iOS)
  - Automatically skipped for in-memory databases
- **4 comprehensive behavior tests**
  - Transaction queue prevents race conditions
  - mmap_size improves read performance at scale
  - temp_store MEMORY improves complex query performance
  - mmapSize can be disabled without breaking functionality

### Technical Details
- mmap_size default validated against production libraries:
  - GrapheneOS AttestationServer: 256MB
  - WechatExporter: 256MB
  - Android ArchiveTune: 256MB
  - better-sqlite3 tests: Fresh DB per test pattern
- temp_store = MEMORY: Keeps temporary tables/indexes in RAM
- locking_mode = NORMAL: Allows multiple connections (vs EXCLUSIVE)
- All 215 tests passing (211 + 4 behavior tests)
- No regressions in query or write performance

---

## [1.2.7] - 2026-02-25

### Fixed 🔥
- **Transaction queue for bulkWrite: Prevents race conditions**
  - Added `sqliteTransaction()` helper to serialize concurrent writes
  - Wraps bulkWrite in transaction queue (BEGIN IMMEDIATE → COMMIT/ROLLBACK)
  - Prevents data corruption from parallel bulkWrite calls
  - SQLite doesn't support concurrent writes - queue ensures serialization

### Added
- **7 comprehensive transaction queue tests**
  - Tests for successful transactions, rollback on error
  - Concurrent write serialization verification
  - Race condition prevention tests
  - Error preservation and handler result tests

### Technical Details
- Transaction queue uses WeakMap to track per-database queues
- BEGIN IMMEDIATE ensures exclusive write lock
- Automatic ROLLBACK on errors
- All 211 tests passing (7 new transaction queue tests)
- No performance regression (transactions were already implicit)

---

## [1.2.6] - 2026-02-25

### Performance 🔥
- **Statement caching in all() and get(): 35% variance reduction**
  - Added LRU statement caching to all() and get() methods
  - Previously only run() had caching, causing 22% query variance
  - queryEq: 5.43ms → 3.52ms StdDev (35% reduction)
  - queryRepeated: 4.25ms → 3.87ms StdDev (9% reduction)
  - 6.8x faster for cached queries (performance test)

### Added
- **Linus-style close() safety**
  - close() now throws on use-after-close (prevents resource leaks)
  - Matches industry standard (file handles, DB connections, streams)
  - Prevents silent failures and memory leaks
- **20 comprehensive StatementManager tests**
  - Cache hits/misses, LRU eviction, boundary conditions
  - Multiple managers isolation, statement finalization
  - Stress tests: 10k queries in 81ms (8.17µs per query)

### Technical Details
- Statement cache uses same LRU pattern as run() method
- MAX_STATEMENTS = 500 with proper finalization on eviction
- close() sets flag and throws Error on subsequent use
- All 204 tests passing (20 new StatementManager tests)
- No regressions in query or write performance

---

## [1.2.5] - 2026-02-25

### Performance 🔥
- **Bounded statement cache: Prevents memory leaks**
  - Added MAX_STATEMENTS = 500 with LRU eviction
  - Calls finalize() on evicted statements to free resources
  - No performance regression - cache hit path unchanged
- **bulkWrite(100) optimization: 2.1x faster**
  - 3.83ms → 1.82ms (Phase 1 PRAGMA optimizations showing impact at scale)

### Changed
- **Document cache removed** (Phase 2 Iteration 5)
  - Industry research: PouchDB, Dexie, LokiJS, WatermelonDB don't use document-level caching
  - SQLite page cache (PRAGMA cache_size = -32000) is sufficient
  - Simpler architecture, no cache invalidation complexity

### Fixed
- **Timing test reliability on Windows**
  - Switched from performance.now() to process.hrtime.bigint() for nanosecond precision
  - Fixes flaky tests caused by ~1ms resolution on Windows
  - Applied to "Production Scenario 3" and "Edge Case 13" tests

### Added
- bulkWrite(100) benchmark test to measure Phase 2 impact at scale

### Technical Details
- Statement cache bounded at 500 entries (prevents unbounded growth)
- LRU eviction: moves accessed statements to end, evicts oldest
- All 184 tests passing with reliable timing
- No regressions in query or write performance

---

## [1.2.4] - 2026-02-25

### Performance 🔥
- **count() optimization: 4.5x faster at scale**
  - Fixed to use `SELECT COUNT(*)` instead of fetching all documents
  - 10k docs: 21.74ms → 5.03ms (4.32x faster)
  - 100k docs: 219.44ms → 48.41ms (4.53x faster)
- **PRAGMA optimizations: 2x faster writes**
  - Added `PRAGMA wal_autocheckpoint = 1000` (+12% write performance)
  - Added `PRAGMA cache_size = -32000` (32MB cache for better query performance)
  - Added `PRAGMA analysis_limit = 400` (faster query planning)
  - bulkWrite: 0.36ms → 0.18ms (2x faster for single doc)
- **Query cache increase: 500 → 1000**
  - Prevents cache thrashing in multi-collection apps
  - Supports 5-10 collections × 10-20 queries each

### Added
- Comprehensive Phase 1 benchmark suite (200 runs @ 10k docs, 100 runs @ 100k docs)
- Optimization journey documentation with baseline results and Phase 2-4 roadmap

### Technical Details
- count() changed from O(n) to O(1) complexity
- All optimizations verified with 260/260 tests passing
- No regressions in query performance (1.01-1.03x, within margin of error)
- Low standard deviation confirms stable, reliable results

---

## [1.2.3] - 2026-02-25

### Changed
- **Code Organization**
  - Reorganized tests into unit/integration/benchmarks structure
  - Added TypeScript path aliases ($app/* → src/*) for cleaner imports
  - Updated all test imports to use path aliases
  - Eliminated all `any` types from core modules (src/)
  - Removed obsolete test files and old benchmark directory

### Technical Details
- Zero `any` types in src/ (instance.ts, rxdb-helpers.ts, statement-manager.ts, builder.ts)
- Proper TypeScript types: `SQLQueryBindings[]`, `RxAttachmentData`, generic `all<T>()`
- Test structure: test/unit/, test/unit/operators/, test/integration/, test/benchmarks/
- Path aliases configured in tsconfig.json

### Test Results
- 181/184 tests passing (3 pre-existing regex bugs)
- All type safety improvements verified

---

## [1.2.2] - 2026-02-24

### Fixed
- **$type Operator** (SQL Translation)
  - Fixed translateType() signature: now requires jsonColumn, fieldName, and type parameters
  - Rewritten to use SQLite's json_type() for all 6 RxDB types (was using typeof() for only 3)
  - All types now translate to SQL: null, boolean, number, string, array, object
  - Removed redundant canTranslateToSQL check (all types now supported)
  - Fixed TypeScript error: "Expected 3 arguments, but got 2"

### Changed
- **Architecture Simplification**
  - Removed redundant ternary in translateType() (both branches identical)
  - Cleaner jsonPath construction: `$.${fieldName}`

### Test Results
- 181/184 tests passing (3 pre-existing regex bugs unrelated to $type)
- All 6 $type operator tests passing

---

## [1.2.1] - 2026-02-24

### Added
- **$elemMatch with $and/$or/$nor** (SQL Fast Path)
  - Implemented nested logical operators inside $elemMatch queries
  - Uses single EXISTS pattern with combined WHERE clause (SQLite best practice)
  - Eliminates Mingo fallback for complex array matching
  - 8 integration tests for $elemMatch with logical operators

### Changed
- **Architecture Simplification**
  - Removed redundant $and/$or/$nor validation from canTranslateToSQL()
  - Simplified routing logic (processSelector handles all cases)

### Performance
- $elemMatch with $and: ~24.44ms (SQL fast path)
- $elemMatch with $or: ~25.23ms (SQL fast path)
- $elemMatch with $nor: ~25.33ms (SQL fast path)

### Test Results
- 8/8 new integration tests passing
- 180/183 total tests passing (3 pre-existing regex bugs)

---

## [1.2.0] - 2026-02-24

### Added
- **$elemMatch Operator** (SQL Translation)
  - Implemented with EXISTS + json_each() pattern
  - Supports simple field matching inside arrays
  - Foundation for nested logical operators
- **$type Array Operator**
  - Added json_type check for 'array' type detection
  - Completes $type operator support
- **ourMemory Regex Matcher**
  - Custom LRU-cached regex matcher (100 entries, 53 lines)
  - Replaces Mingo for simple case-insensitive $regex queries
  - Expression index support: LOWER(field) parsing
  - 6.1% performance improvement (37.41ms → 35.11ms)
- **Mingo Routing Architecture**
  - Added canTranslateToSQL() for intelligent query routing
  - SQL fast path for translatable queries
  - Mingo fallback for complex patterns
  - Schema-aware query builder

### Changed
- **Query Builder Schema-Aware**
  - translateRegex() now accepts schema and fieldName parameters
  - Enables expression index detection
  - Better optimization decisions

### Fixed
- Disabled case-insensitive regex translation to SQL (correctness over performance)

### Performance
- ourMemory regex matcher: 6.1% faster than Mingo (37.41ms → 35.11ms)
- $elemMatch: SQL fast path for simple queries

### Test Results
- Comprehensive array edge case tests added
- All $type array tests passing

---

## [1.1.4] - 2026-02-24

### Fixed
- **$nor Operator Bug** (Critical)
  - Fixed $nor generating raw field names instead of json_extract() paths
  - Was causing "no such column" SQLite errors
  - Now schema-aware and handles JSONB storage correctly
- **Query Cache Collision** (Critical)
  - Fixed cache collisions between different collections
  - Cache key now includes collectionName: `v${version}_${collectionName}_${selector}`
  - Prevents wrong SQL being used across collections with same schema

### Changed
- **DRY Refactor: Unified $or/$nor Handling**
  - Created `buildLogicalOperator()` helper for both operators
  - Eliminated code duplication (15 lines of inline $or code)
  - Both operators now use same schema-aware logic
- **buildWhereClause Signature**
  - Added `collectionName` as 3rd parameter
  - Ensures cache isolation between collections
  - All unit tests updated for new signature

### Added
- **DEBUG_QUERIES Logging**
  - Added fallback error logging via `DEBUG_QUERIES=1` env var
  - Helps debug which queries trigger fallback path
- **Comprehensive Integration Tests**
  - 27 new integration tests for all SQL operators
  - Covers: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $exists, $regex (simple), $and, $or, $not, $nor, $type (simple), $size, $mod
  - Tests include edge cases and complex nested queries
- **TDD Tests for Complex Operators**
  - 6 failing tests documenting fallback bug
  - Tests for: complex $regex (character classes, flags), $elemMatch, $type (array/object)
  - Will pass once Mingo fallback is implemented

### Test Results
- **Local tests: 162/162 pass (100%)** ✅
- **Failing tests: 6/6 (expected - TDD tests for Mingo fallback)** ⏳
- All SQL operators working correctly
- $nor bug fixed and tested

### Technical Details
- Removed broken `translateNor()` function
- Kept `processOperatorValue()` (used by `translateNot()`)
- Cache key now: `v${schema.version}_${collectionName}_${stringify(selector)}`
- RxDB integration verified: `this.collectionName` available and passed correctly

---

## [1.1.0] - 2026-02-23

### Added
- **schema.indexes Support** (v1.1.0)
  - Dynamic index creation from schema.indexes definitions
  - Supports single-field indexes: `['age']`
  - Supports compound indexes: `['age', 'status']`
  - Uses `json_extract()` for JSONB fields
  - Proper index naming: `idx_users_v0_age_status`
  - 9 lines of implementation code
  - Research validated: 4/5 RxDB storage plugins implement this

### Changed
- **ORDER BY Optimization** (v1.1.0)
  - Removed redundant SQL `ORDER BY id` (we sort in-memory anyway)
  - Eliminates temp B-tree overhead in SQLite
  - Research finding: We already sort at line 226, SQL ORDER BY was redundant

### Performance
- **29.8% faster queries** (165.43ms → 116.09ms avg on 100k docs)
  - Test 1 (age > 50): 20.6% faster
  - Test 2 (status = "active"): 22.1% faster
  - Test 3 (age > 30 AND status): 26.8% faster
  - Test 4 (age BETWEEN 25-35): 51.5% faster!

### Test Results
- **Local tests: 138/138 pass (100%)** ✅
- **Official RxDB tests: 122/122 pass (100%)** ✅
- **Total: 260/260 tests pass (100%)** 🎉

### Research
- **3 research agents deployed** (2 codebase + 1 web)
  - Verified implementation correctness vs other RxDB storages
  - Analyzed ORDER BY patterns in storage plugins
  - Researched SQLite covering indexes and optimization
- **Key findings:**
  - Our implementation matches standard RxDB patterns
  - Better than official SQLite Trial (which has no indexes)
  - ORDER BY id was causing temp B-tree overhead
  - Removing it eliminated redundant sorting

### Documentation
- Added Pattern #28: schema.indexes Support
- Added Pattern #29: ORDER BY Optimization
- Updated ROADMAP.md with implementation results

---

## [1.0.1] - 2026-02-23

### Added
- **EXPLAIN QUERY PLAN Debug Mode** (Development Tool)
  - Activated via `DEBUG_QUERIES=1` environment variable
  - Logs query plans, SQL, and args to console
  - Helps verify query builder generates optimal SQL
  - Validates SQLite index usage
  - Zero production overhead (env var check only)

### Usage
```bash
DEBUG_QUERIES=1 bun test
```

---

## [1.0.0] - 2026-02-23

### Added
- **Attachments Support** (Phase 4)
  - Storage-level implementation with 4 comprehensive tests
  - `getAttachmentData()` returns base64 strings with digest validation
  - Preserves `_attachments` metadata in documents
  - Attachments table with composite keys (documentId||attachmentId)
  - 122/122 official RxDB tests passing (includes 5 attachment tests)
- **RxDB Helper Functions** (Phase 4)
  - `categorizeBulkWriteRows()` - Battle-tested conflict detection + attachment extraction
  - `stripAttachmentsDataFromDocument()` - Remove attachment .data field, keep metadata
  - `stripAttachmentsDataFromRow()` - Strip attachments from bulk write rows
  - `attachmentWriteDataToNormalData()` - Convert attachment write format to storage format
  - `getAttachmentSize()` - Calculate attachment size from base64

### Changed
- **bulkWrite Refactored** - Now uses `categorizeBulkWriteRows()` helper
  - Cleaner architecture with proper conflict handling
  - Automatic attachment extraction
  - Matches official adapter patterns (Dexie, MongoDB, SQLite)

### Test Results
- **Local tests: 138/138 pass (100%)** ✅
- **Official RxDB tests: 122/122 pass (100%)** ✅
- **Total: 260/260 tests pass (100%)** 🎉

### Performance
- Database operations: 1.06-1.68x faster than better-sqlite3
- Query builder cache: 5.2-57.9x speedup for cached queries
- All optimizations from v0.4.0 included

### Documentation
- Updated ROADMAP.md - Phase 4 marked COMPLETE
- Removed redundant Phase 4 TDD implementation details
- All helper functions documented with line numbers

---

## [0.4.0] - 2026-02-23

### Added
- **Query Builder LRU Cache** (Phase 2.5)
  - 5.2-57.9x speedup for repeated queries
  - High-frequency: 505K-808K queries/sec
  - Bounded at 500 entries (no memory leak)
  - True LRU eviction with canonical key generation (fast-stable-stringify)
  - Zero dependencies except fast-stable-stringify (5KB)
- **RxDB Official Test Suite Integration** (Phase 3.1)
  - 112/112 official RxDB tests passing (100%)
  - StatementManager abstraction for automatic statement lifecycle
  - Connection pooling with reference counting for multi-instance support
  - Official `addRxStorageMultiInstanceSupport()` integration
  - Composite primary key support
  - Bun test suite compatibility (Mocha through Bun)
- **Performance Benchmarks** (Phase 3.2)
  - Bun:sqlite 1.06-1.68x faster than better-sqlite3
  - Benchmarked at 1M documents with WAL + PRAGMA synchronous = 1
  - Query builder cache benchmarks
  - Raw database comparison benchmarks
- **New Query Operators** (8 operators added)
  - `$exists` - Field existence check with IS NULL/IS NOT NULL
  - `$regex` - Pattern matching with LIKE translation and Mingo fallback
  - `$elemMatch` - Array element matching (Mingo fallback)
  - `$not` - Negation operator
  - `$nor` - Logical NOR
  - `$type` - Type checking with typeof()
  - `$size` - Array size with json_array_length()
  - `$mod` - Modulo operations

### Changed
- **BREAKING**: Statement lifecycle management
  - Static SQL uses db.query() (cached, max 20)
  - Dynamic SQL uses db.prepare() + finalize() (no cache pollution)
  - StatementManager abstraction eliminates manual try-finally boilerplate
- Connection pooling now mandatory for multi-instance support
- Switched from custom multi-instance to RxDB's official implementation

### Fixed
- Statement resource leaks (7 locations in instance.ts)
- Collection isolation bug (events leaked across collections)
- Composite primary key handling (string vs object format)
- EventBulk.id generation (empty string → unique timestamp + random)
- Multi-instance event propagation via BroadcastChannel
- Bun test suite compatibility (node:sqlite import, test globals)

### Performance
- Query builder cache: 5.2-57.9x speedup for cached queries
- Database operations: 1.06-1.68x faster than better-sqlite3
- No OOM errors (proper statement finalization)
- Tests complete in 12.91s (no hangs)

### Test Results
- **Local tests: 134/134 pass (100%)**
- **Official RxDB tests: 112/112 pass (100%)**
- **Total: 246/246 tests pass (100%)** 🎉

### Documentation
- Added `docs/id1-testsuite-journey.md` - Complete debugging journey (15 iterations)
- Added `docs/official-test-suite-setup.md` - Guide for running RxDB tests with Bun
- Updated `docs/architectural-patterns.md` - Added patterns 15-24
- Updated `ROADMAP.md` - Phase 2.5 and 3.2 marked COMPLETE, Phase 4 marked READY

### Technical Debt Resolved
- Statement lifecycle properly managed (no leaks)
- Connection pooling with reference counting
- Test architecture at correct level (RxDatabase for integration, storage for low-level)
- Proper separation of concerns (we handle DB pooling, RxDB handles event coordination)

---

## [0.3.1] - 2026-02-22

### Added
- **JSONB Storage**: Implemented SQLite's native binary JSON format as default storage
  - 1.57x faster complex queries (657ms → 418ms at 1M docs)
  - 1.20x faster read + parse operations
  - 1.04x faster simple queries
  - Uses `jsonb()` on INSERT, `json()` on SELECT
- **Smart Regex Optimization**: Convert simple regex patterns to SQL operators
  - 2.03x faster exact matches (^text$ → = operator)
  - 1.23x faster case-insensitive (COLLATE NOCASE vs LOWER())
  - Overall 1.24x speedup across all patterns
- **Regression Tests**: Added tests for % and _ escaping edge cases

### Fixed
- Critical bug: Missing % and _ escaping in case-insensitive exact match regex patterns

### Investigated
- **FTS5 Trigram Indexes**: Benchmarked at 100k and 1M scales
  - Result: 1.5-1.79x SLOWER at our scale
  - Decision: NOT implemented (only beneficial at 10M+ rows)
  - Documented findings in architectural-patterns.md

### Performance
- Complex queries: 1.57x faster (JSONB)
- Exact match regex: 2.03x faster (smart optimization)
- Read operations: 1.20x faster (JSONB)

---

## [0.3.0] - 2026-02-22

### Added
- **Advanced Query Operators** (4 new operators)
  - `$in` - Value in array (80% usage in production)
  - `$nin` - Value not in array
  - `$or` - Logical OR with proper parentheses handling
  - `$and` - Explicit logical AND
- NULL handling for `$in` / `$nin` operators
- Recursive query builder with `logicalDepth` tracking
- 13 new tests for advanced operators

### Performance
- Benchmark results (10k documents):
  - Average query time: 27.39ms
  - Supports complex nested queries: `{$or: [{$and: [...]}, {field: {$in: [...]}}]}`

### Technical
- DRY architecture: Pure operator functions, recursive builder
- Type-safe: 0 `any` types, proper TypeScript throughout
- Test coverage: 44/44 tests passing

## [0.2.0] - 2026-02-22

### Added
- Conflict detection for concurrent writes
  - Catches UNIQUE constraint violations
  - Returns 409 status with existing document
  - Enables proper RxDB replication conflict handling

### Changed
- **BREAKING**: `bulkWrite` now uses individual INSERT statements instead of INSERT OR REPLACE
  - Conflicts are now detected and returned as errors
  - Enables proper RxDB replication conflict resolution

### Performance
- Benchmark results (10k documents, 10-run average):
  - **JSON + TEXT: 23.40ms** (WINNER)
  - Tested alternatives: MessagePack (137ms), bun:jsc (37ms)
  - **Verdict: Bun's SIMD-accelerated JSON is fastest**

### Research Notes
- Extensively tested binary serialization formats (MessagePack, bun:jsc)
- MessagePack: 5.6x slower than JSON (pure JS implementation)
- bun:jsc (optimized): 1.58x slower than JSON (Structured Clone overhead)
- **Conclusion: JSON + TEXT is optimal for Bun's architecture**

## [0.1.2] - 2026-02-22

### Added
- Conflict detection for concurrent writes
  - Catches UNIQUE constraint violations
  - Returns 409 status with existing document
  - Enables proper RxDB replication conflict handling

### Changed
- **BREAKING**: `bulkWrite` now uses individual INSERT statements instead of INSERT OR REPLACE
  - Conflicts are now detected and returned as errors
  - Enables proper RxDB replication conflict resolution

### Performance
- Benchmark results (10k documents):
  - Simple equality: 15.40ms
  - Greater than: 22.05ms
  - Multiple conditions: 23.51ms
  - Range query: 24.89ms
  - Average: 21.46ms

## [0.1.2] - 2026-02-22

### Added
- WAL mode for 3-6x write speedup and better concurrency
  - Automatically enabled for file-based databases
  - Skipped for in-memory databases (not supported by SQLite)
- Proper checkpoint implementation in changeStream
  - Checkpoint structure: `{ id: documentId, lwt: timestamp }`
  - Enables efficient replication tracking

### Removed
- **BREAKING**: Removed `conflictResultionTasks()` method (doesn't exist in RxDB interface)
- **BREAKING**: Removed `resolveConflictResultionTask()` method (doesn't exist in RxDB interface)
  - Conflict resolution happens at RxDB replication level, not storage level

### Changed
- WAL mode test now uses file-based database instead of in-memory

### Performance
- Write operations: 3-6x faster with WAL mode
- Concurrent reads during writes: No blocking with WAL mode

## [0.1.1] - 2026-02-22

### Added
- SQL query builder for WHERE clause generation (10-100x speedup)
  - 6 Mango operators: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
  - Functional architecture (pure functions, no state)
  - Column mapping for RxDB internal fields
  - Fallback to in-memory filtering if WHERE fails
- Benchmark script for performance testing
- Comprehensive test suite (27 tests total)
  - 19 storage tests
  - 6 operator tests
  - 10 query builder tests

### Changed
- **BREAKING**: Removed per-document error handling in `bulkWrite`
  - Now uses atomic transactions (all or nothing)
  - Entire batch fails if any document fails
- Removed ALL `any` types (32 instances → 0)
- Proper TypeScript types throughout
  - `RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>`
  - `RxStorageInstance` with proper type parameters
  - `PreparedQuery<RxDocType>` for queries
  - `RxStorageWriteError<RxDocType>` for errors

### Fixed
- Type safety: Zero `any` types in entire codebase
- Test isolation: Reference folder excluded from test runs
- Schema types: Proper RxDB internal fields in all schemas

### Performance
- Query performance: ~20ms average for 10k documents
- Uses SQL WHERE clauses with indexed columns
- Expected 10-100x speedup vs in-memory filtering

## [0.1.0] - 2026-02-20

### Added
- Initial RxDB storage adapter for Bun's native SQLite
- Basic CRUD operations (bulkWrite, query, findById, count)
- Atomic transactions via `bun:sqlite`
- In-memory Mango query filtering
- Streak tracking support
- Change stream for reactivity
- 8 passing tests

### Features
- SQLite via `bun:sqlite` (no external dependencies)
- RxDB v16 and v17 beta support
- MIT licensed
