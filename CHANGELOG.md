# Changelog

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
