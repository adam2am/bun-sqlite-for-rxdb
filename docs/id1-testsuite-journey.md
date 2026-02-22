# RxDB Test Suite Debugging Journey

## Problem Statement
RxDB official test suite hangs when running with our Bun SQLite storage adapter.

---

## Iteration 1: Initial Investigation (EventBulk.id Bug)

### What We Tried
- Added debug logs to track test execution
- Ran single test "should emit all events"

### What We Found
- Test was timing out waiting for events
- EventBulk.id was empty string `''`
- `flattenEvents()` checks `if (input.id && input.events)` - empty string is FALSY!

### What Worked
✅ **Fix:** Changed `id: ''` to `id: Date.now().toString() + '-' + Math.random().toString(36).substring(2, 11)`
✅ **Result:** Single test passes in 924ms

### What Didn't Work
❌ Test suite still hangs when running ALL tests

---

## Iteration 2: Cleanup Order Investigation

### What We Tried
- Lisa agents investigated cleanup patterns in official adapters
- Analyzed close() and remove() order

### What We Found
- Official adapters complete stream BEFORE closing database
- We were closing database BEFORE completing stream
- This orphans subscribers waiting on closed DB

### What Worked
✅ **Fix:** Swapped cleanup order - `changeStream$.complete()` then `db.close()`
✅ **Result:** Single test still passes

### What Didn't Work
❌ Test suite still hangs when running ALL tests

---

## Iteration 3: Idempotency Guard

### What We Tried
- Added Promise memoization pattern for close()
- Prevents double-close issues

### What We Found
- Official adapters use `if (this.closed) return this.closed` pattern
- Handles concurrent close() calls correctly

### What Worked
✅ **Fix:** Added `closed?: Promise<void>` property with guard
✅ **Result:** Single test passes, handles non-awaited remove() correctly

### What Didn't Work
❌ Test suite still hangs when running ALL tests

---

## Iteration 4: Test Cleanup

### What We Tried
- Added manual cleanup to our unit tests (10 tests were leaking)

### What We Found
- Our storage.test.ts had 10/15 tests without cleanup
- Each leaked instance holds open Database + uncompleted Subject

### What Worked
✅ **Fix:** Added `await instance.remove()` to all tests
✅ **Result:** Our unit tests: 101 pass, 0 fail

### What Didn't Work
❌ RxDB test suite still hangs (we can't modify their test file)

---

## Iteration 5: Parallel Construction Hang (THE SMOKING GUN)

### What We Tried
- Added strategic instrumentation to track WHERE hang occurs
- Ran full test suite with detailed logging

### What We Found
**CRITICAL:** Multiple `new Database(':memory:')` calls in parallel → only one completes!

```
[STORAGE] createStorageInstance called - db: jlamlebnztqm
[INSTANCE] Constructor START - db: jlamlebnztqm
[STORAGE] createStorageInstance called - db: fujptizuenzh  ← BEFORE first finishes!
[INSTANCE] Constructor START - db: fujptizuenzh
[STORAGE] createStorageInstance called - db: kqgcjynxefmi  ← BEFORE either finishes!
[INSTANCE] Creating Database - filename: :memory:  ← Only ONE completes!
```

**Root Cause:** Bun's `new Database()` is NOT thread-safe for parallel construction.

### What Worked
✅ **Discovery:** Official adapters use connection pooling + reference counting
✅ **Evidence:** Lisa found the exact pattern in SQLite and Dexie adapters

### What Didn't Work
❌ Haven't implemented the fix yet

---

## Iteration 6: Connection Pooling (First Attempt)

### What We Tried
- Created `src/connection-pool.ts` with reference counting
- Modified instance.ts to use `getDatabase()` and `releaseDatabase()`

### What We Found
- Connection pooling FIXED THE HANG!
- Tests ran much further (845 lines vs 16 before)
- But hit new issue: `SQLiteError: out of memory`

### What Worked
✅ **Fix:** Connection pooling prevents parallel construction hang
✅ **Result:** Tests run sequentially, no more parallel construction issues

### What Didn't Work
❌ **New Problem:** All instances share ONE `:memory:` database → data accumulates → OOM

---

## Iteration 7: Per-Database Pooling

### What We Tried
- Use database NAME as pool key instead of just `:memory:`
- Pool key: `${databaseName}:memory:` for in-memory databases

### What We Found
- Each database name gets its own connection
- Collections within same database share connection
- This matches how databases actually work

### What Worked
✅ **Fix:** `poolKey = filename === ':memory:' ? ${databaseName}:memory: : filename`
✅ **Result:** No more OOM - each database isolated

### What Didn't Work
❌ **Bug:** Passed pool key to `new Database()` → tried to open FILE "testdb:memory:"
❌ **Result:** Unit tests failed with "unable to open database file"

---

## Iteration 8: Separate Pool Key from Filename

### What We Tried
- Modified `getDatabase(poolKey, actualFilename)` to separate concerns
- Pool by database name, but pass `:memory:` to Database constructor

### What We Found
- Pool key is for INDEXING (which connection to reuse)
- Actual filename is for DATABASE CREATION (what to pass to Bun)
- These are two different concerns

### What Worked
✅ **Fix:** `getDatabase(poolKey, actualFilename)` with separate parameters
✅ **Result:** Unit tests: 101 pass, 0 fail

### What Didn't Work
❌ **Current Status:** RxDB test suite still hangs (845 lines, then stops)

---

## Current Status (Iteration 8)

### What's Working
- ✅ Connection pooling prevents parallel construction hang
- ✅ Per-database pooling prevents memory accumulation
- ✅ Unit tests pass (101/101)
- ✅ Single RxDB test passes

### What's NOT Working
- ❌ Full RxDB test suite hangs after ~845 lines
- ❌ Second test in suite never starts

### Next Investigation Needed
Looking at output:
- Lines 20-100: Creates 20+ collections with SAME database "ypoiivbnigzp"
- All share ONE pooled connection (correct behavior)
- File ends at line 845 (hung after 120s timeout)
- Need to find WHERE in those 845 lines it actually hung

---

## Key Learnings

### What Works (Proven Solutions)
1. **EventBulk.id must be truthy** - Empty string breaks flattenEvents()
2. **Cleanup order matters** - Complete stream before closing DB
3. **Idempotency guards essential** - Promise memoization prevents double-close
4. **Connection pooling required** - Bun's Database() not thread-safe for parallel construction
5. **Per-database pooling** - Each database name needs its own connection
6. **Separate pool key from filename** - Indexing vs creation are different concerns

### What Doesn't Work (Failed Approaches)
1. ❌ No connection pooling - Parallel construction hangs
2. ❌ Global connection pooling - All databases share one connection → OOM
3. ❌ Using pool key as filename - Tries to open file "dbname:memory:"

### Patterns from Official Adapters
- **SQLite:** `DATABASE_STATE_BY_NAME` map with `openConnections` counter
- **Dexie:** `REF_COUNT_PER_DEXIE_DB` map with reference counting
- **Both:** Only close when last instance releases (ref count = 0)

---

## Architecture Decisions

### Connection Pool Design
```typescript
// Global state (like official adapters)
const DATABASE_POOL = new Map<string, DatabaseState>();

type DatabaseState = {
  db: Database;
  refCount: number;
};

// Pool by database name for :memory:, by filename for file-based
poolKey = filename === ':memory:' ? `${databaseName}:memory:` : filename;
```

### Why This Is Proper Infrastructure (Not Bandaid)
- Matches database semantics (different names = different databases)
- Matches official adapter patterns (proven solution)
- Minimal code (~30 lines)
- Self-documenting (code clearly shows intent)
- Solves root cause (parallel construction + resource management)

---

## Files Modified

### Core Implementation
- `src/connection-pool.ts` - NEW (30 lines)
- `src/instance.ts` - Modified constructor, close(), remove()
- `src/storage.ts` - Added import

### Tests
- `src/storage.test.ts` - Added cleanup to 10 tests

### Documentation
- `docs/architectural-patterns.md` - Documented all patterns
- `ROADMAP.md` - Tracked progress

---

## Metrics

### Test Results
- **Unit tests:** 101 pass, 0 fail (100% pass rate)
- **RxDB single test:** PASS (924ms)
- **RxDB full suite:** HANG (after 845 lines / ~120s)

### Code Changes
- **Lines added:** ~50 (connection pool + modifications)
- **Lines removed:** ~10 (old direct Database creation)
- **Net change:** ~40 lines
- **Complexity:** Minimal (standard connection pooling pattern)

---

## Iteration 9: Connection Pooling REGRESSION (FAILED)

### What We Tried
- Implemented connection pooling with reference counting
- Per-database pooling to prevent memory accumulation
- Separate pool key from filename

### What We Found
**CRITICAL REGRESSION:**
- **BEFORE pooling:** 43 pass, 13 fail (test suite COMPLETED in 8.71s)
- **AFTER pooling:** HANGS at 845 lines (never completes)

**We made it WORSE, not better!**

### What Worked
❌ **NOTHING** - Connection pooling introduced a NEW hang

### What Didn't Work
❌ Connection pooling causes hang after instance creation
❌ Test suite never completes (worse than before)
❌ Previous version at least ran all tests (with some failures)

### Decision
**REVERT connection pooling** - Go back to baseline (43 pass / 13 fail)

### Why Connection Pooling Failed
- Introduced new synchronization issues
- Bun's Database might have internal state that doesn't work with pooling
- The "parallel construction hang" we thought we saw might have been a misdiagnosis
- Original implementation (no pooling) actually worked better

---

## Current Status (After Iteration 9 Revert)

### Baseline Performance (No Connection Pooling)
- ✅ Test suite COMPLETES in 8.71s
- ✅ 43 tests pass
- ❌ 13 tests fail
- ✅ No hangs

### What's Working
- EventBulk.id fix (unique ID generation)
- Cleanup order fix (stream before DB)
- Idempotency guards
- Test cleanup in our unit tests

### What's NOT Working
- 13 RxDB tests fail (but at least they run!)
- Need to investigate the actual test failures, not hangs

---

## Key Learnings (Updated)

### What Works (Proven Solutions)
1. **EventBulk.id must be truthy** - Empty string breaks flattenEvents()
2. **Cleanup order matters** - Complete stream before closing DB
3. **Idempotency guards essential** - Promise memoization prevents double-close
4. **Manual test cleanup** - Add cleanup to all tests

### What Doesn't Work (Failed Approaches)
1. ❌ No connection pooling - Parallel construction hangs (WRONG DIAGNOSIS!)
2. ❌ Global connection pooling - All databases share one connection → OOM
3. ❌ Per-database pooling - Introduces NEW hang (worse than before!)
4. ❌ Using pool key as filename - Tries to open file "dbname:memory:"

### The Truth About Connection Pooling
**Connection pooling was a RED HERRING:**
- We thought parallel construction was causing hangs
- But the original implementation (no pooling) actually COMPLETES the test suite
- Connection pooling introduced a NEW, WORSE hang
- The real issue: 13 test failures that need investigation

---

## Next Steps (Corrected)

1. ✅ Revert connection pooling
2. ✅ Remove instrumentation logs
3. ⏳ Investigate the 13 actual test failures
4. ⏳ Fix failures one by one
5. ⏳ Aim for 56/56 tests passing

---

## Architecture Decisions (Corrected)

### Connection Pooling: REJECTED
- Introduced worse problems than it solved
- Original implementation is simpler and works better
- Bun's Database doesn't need pooling for our use case

### Minimal Implementation Wins
- Keep it simple: `new Database()` per instance
- Let Bun handle resource management
- Focus on fixing actual test failures, not imagined problems
