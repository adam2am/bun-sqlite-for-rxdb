# RxDB Test Suite Debugging Journey

## Problem Statement
RxDB official test suite had 8 failures when running with our Bun SQLite storage adapter.

---

## Iteration 1-9: Previous Work (See Git History)

**Summary of earlier iterations:**
- Fixed EventBulk.id bug (empty string → unique ID)
- Fixed cleanup order (stream before DB)
- Added idempotency guards
- Investigated connection pooling (reverted - made things worse)
- Baseline: 48 pass, 8 fail

---

## Iteration 10: Statement Lifecycle Investigation (2026-02-23)

### What We Tried
- Lisa agents investigated why tests were hanging
- Analyzed db.prepare() vs db.query() behavior
- Researched Bun's SQLite statement lifecycle

### What We Found
**CRITICAL:** Prepared statements were NEVER being finalized!

**Evidence:**
- 7 leak locations in src/instance.ts
- Each test creates ~10 operations × 2 statements = ~20 leaked statements
- 48 tests × 20 = ~960 leaked statement objects → OOM

**Root Cause:**
```typescript
// LEAKING CODE:
const stmt = this.db.prepare(sql);
stmt.run(...);
// Statement NEVER finalized → resource leak
```

**Bun's SQLite has TWO APIs:**
1. `db.query(sql)` - Cached (max 20), auto-finalized on db.close()
2. `db.prepare(sql)` - Uncached, requires manual finalize()

### What Worked
✅ **Discovery:** We were using db.prepare() without finalize()
✅ **Research:** Librarian found Bun's caching behavior
✅ **Analysis:** Lisa identified all 7 leak locations

### What Didn't Work
❌ Haven't implemented the fix yet

---

## Iteration 11: StatementManager Abstraction (2026-02-23)

### What We Tried
- Created StatementManager abstraction layer
- Automatic statement lifecycle management
- Smart caching strategy based on SQL type

### What We Found
**Key Insight:** Static SQL vs Dynamic SQL need different strategies

**Static SQL** (INSERT/UPDATE with placeholders):
- Same SQL string reused many times
- Perfect for db.query() caching
- Example: `INSERT INTO users VALUES (?, ?, ?)`

**Dynamic SQL** (WHERE clauses from buildWhereClause):
- Different SQL string each time
- Would pollute db.query() cache (max 20)
- Example: `SELECT * FROM users WHERE (age > 25 AND status = 'active')`

### What Worked
✅ **Fix:** Created StatementManager with smart routing
```typescript
class StatementManager {
  all(query, params) {
    if (isStaticSQL(query)) {
      // Cache with db.query()
      return this.db.query(query).all(...params);
    } else {
      // Use db.prepare() + finalize()
      const stmt = this.db.prepare(query);
      try {
        return stmt.all(...params);
      } finally {
        stmt.finalize();
      }
    }
  }
}
```

✅ **Result:** 52/56 tests pass (was 48/56)
✅ **Improvement:** +4 tests fixed (OOM errors eliminated)
✅ **No hangs:** Tests complete in 12.91s

### What Didn't Work
❌ **4 tests still fail:**
1. cleanup() test - Returns true always (known issue)
2-4. Multi-instance tests - Need connection pooling

---

## Iteration 12: Connection Pooling Analysis (2026-02-23)

### What We Need
**Multi-instance tests require connection pooling** (Lisa #3 investigation)

**Evidence from official adapters:**
```typescript
// Official SQLite adapter pattern:
const DATABASE_STATE_BY_NAME = new Map();

function getDatabaseConnection(databaseName) {
  let state = DATABASE_STATE_BY_NAME.get(databaseName);
  if (!state) {
    state = { database: open(databaseName), openConnections: 1 };
    DATABASE_STATE_BY_NAME.set(databaseName, state);
  } else {
    state.openConnections++; // REUSE existing connection
  }
  return state.database;
}
```

**Why it's needed:**
- Multi-instance tests create 2-3 instances with SAME databaseName
- Each instance currently: `new Database(':memory:')` → separate DBs
- Test expects: instance A writes, instance B reads → should see data
- Reality: instance A writes to DB #1, instance B reads from DB #2 → no data

**Critical line 44 from official adapter:**
```typescript
// :memory: databases CAN be shared even with different creators
if (state.sqliteBasics !== sqliteBasics && databaseName !== ':memory:') {
  throw new Error('different creator');
}
```

### What We Learned
✅ **Connection pooling is MANDATORY** (not optional)
✅ **Pool by databaseName** (not filename)
✅ **Use reference counting** (openConnections)
✅ **Only close when refCount = 0**

### Status
⏳ **NOT IMPLEMENTED YET** - Next step after StatementManager

---

## Current Status (Iteration 12)

### What's Working
- ✅ StatementManager abstraction (automatic statement lifecycle)
- ✅ Smart caching (static SQL → db.query(), dynamic SQL → db.prepare())
- ✅ No more OOM errors (statements properly finalized)
- ✅ Tests complete without hanging (12.91s)
- ✅ **52/56 tests pass** (was 48/56)

### What's NOT Working
- ❌ cleanup() returns true always (1 test fails)
- ❌ Multi-instance tests fail (3 tests) - need connection pooling

### Next Steps
1. ⏳ Implement connection pooling (DATABASE_STATE_BY_NAME pattern)
2. ⏳ Fix multi-instance tests (expect 3 more to pass → 55/56)
3. ⏳ Fix cleanup() bug if needed (→ 56/56)

---

## Key Learnings

### What Works (Proven Solutions)
1. **StatementManager abstraction** - Eliminates manual finalize() boilerplate
2. **Smart SQL routing** - Static → cache, Dynamic → prepare+finalize
3. **db.query() for static SQL** - Automatic caching and cleanup
4. **db.prepare() for dynamic SQL** - Prevents cache pollution
5. **Connection pooling is mandatory** - Required for multi-instance support

### What Doesn't Work (Failed Approaches)
1. ❌ Manual try-finally everywhere - Too much boilerplate, error-prone
2. ❌ db.query() for everything - Cache overflow on dynamic SQL
3. ❌ db.prepare() without finalize() - Resource leaks → OOM
4. ❌ No connection pooling - Multi-instance tests fail

### Patterns from Official Adapters
- **SQLite:** DATABASE_STATE_BY_NAME with reference counting
- **Dexie:** Similar pooling with REF_COUNT_PER_DEXIE_DB
- **Both:** Pool by databaseName, share :memory: databases
- **Both:** Only close when last instance releases

---

## Architecture Decisions

### StatementManager Design
```typescript
class StatementManager {
  private staticStatements = new Map<string, Statement>();
  
  // Automatic routing based on SQL type
  all(query, params) {
    if (isStaticSQL(query)) {
      // Cache and reuse
      let stmt = this.staticStatements.get(query);
      if (!stmt) {
        stmt = this.db.query(query);
        this.staticStatements.set(query, stmt);
      }
      return stmt.all(...params);
    } else {
      // Prepare, execute, finalize
      const stmt = this.db.prepare(query);
      try {
        return stmt.all(...params);
      } finally {
        stmt.finalize();
      }
    }
  }
  
  close() {
    // Finalize all cached statements
    for (const stmt of this.staticStatements.values()) {
      stmt.finalize();
    }
    this.staticStatements.clear();
  }
}
```

### Why This Is Proper Infrastructure
- **Automatic:** No manual finalize() needed
- **Smart:** Routes based on SQL characteristics
- **DRY:** Single implementation, used everywhere
- **Safe:** Impossible to forget cleanup
- **Minimal:** ~70 lines of code

### Connection Pooling Design (Next)
```typescript
const DATABASE_POOL = new Map<string, DatabaseState>();

type DatabaseState = {
  db: Database;
  refCount: number;
};

// Pool by databaseName (not filename)
function getDatabase(databaseName, filename) {
  let state = DATABASE_POOL.get(databaseName);
  if (!state) {
    state = { db: new Database(filename), refCount: 0 };
    DATABASE_POOL.set(databaseName, state);
  }
  state.refCount++;
  return state.db;
}

function releaseDatabase(databaseName) {
  const state = DATABASE_POOL.get(databaseName);
  if (state) {
    state.refCount--;
    if (state.refCount === 0) {
      state.db.close();
      DATABASE_POOL.delete(databaseName);
    }
  }
}
```

---

## Files Modified

### Core Implementation
- `src/statement-manager.ts` - NEW (70 lines)
- `src/instance.ts` - Refactored to use StatementManager

### Commits
- `42a6cde` - Add StatementManager abstraction
- `c105da5` - Refactor instance.ts to use StatementManager
- `e62c914` - Update .gitignore

---

## Metrics

### Test Results
- **Before:** 48 pass, 8 fail (OOM errors, multi-instance failures)
- **After:** 52 pass, 4 fail (OOM fixed, multi-instance still failing)
- **Improvement:** +4 tests fixed
- **Time:** 12.91s (no hangs)

### Code Changes
- **Lines added:** ~70 (StatementManager)
- **Lines removed:** ~10 (manual try-finally blocks)
- **Net change:** ~60 lines
- **Complexity:** Low (standard abstraction pattern)

---

## My Thoughts on Connection Pooling

### Why It's Required (Not Optional)

**Evidence from Lisa #3 investigation:**
- Official SQLite adapter uses DATABASE_STATE_BY_NAME with reference counting
- :memory: databases CAN be shared (line 44 special handling in official code)
- Without pooling: each instance creates separate :memory: DB
- With pooling: all instances share same :memory: DB

**The Problem:**
```typescript
// Current (WRONG):
const instanceA = new BunSQLiteStorageInstance({ databaseName: 'testdb' });
// Creates: Database(':memory:') #1

const instanceB = new BunSQLiteStorageInstance({ databaseName: 'testdb' });
// Creates: Database(':memory:') #2

// Test expects:
await instanceA.bulkWrite([doc]);
const found = await instanceB.query(query);
// Should find doc, but doesn't (different databases!)
```

**The Fix:**
```typescript
// With pooling (CORRECT):
const instanceA = new BunSQLiteStorageInstance({ databaseName: 'testdb' });
// Gets: DATABASE_POOL.get('testdb') → creates DB #1, refCount = 1

const instanceB = new BunSQLiteStorageInstance({ databaseName: 'testdb' });
// Gets: DATABASE_POOL.get('testdb') → reuses DB #1, refCount = 2

// Now they share the same database!
await instanceA.bulkWrite([doc]);
const found = await instanceB.query(query);
// ✅ Finds doc (same database)
```

### Why close() Order Matters

**Critical sequence:**
1. `stmtManager.close()` - Finalize all cached statements
2. `db.close()` - Close database connection

**If reversed:**
- db.close() called first → database closed
- stmtManager.close() tries to finalize statements → ERROR (db already closed)
- Cached statements leak

**Current implementation is correct:**
```typescript
async close() {
  this.changeStream$.complete();
  this.stmtManager.close();  // ← First: finalize statements
  this.db.close();            // ← Then: close database
}
```

### Next Steps

1. **Implement connection pooling** (~30 lines)
2. **Test multi-instance** (expect 3 more tests to pass → 55/56)
3. **Fix cleanup() bug if needed** (→ 56/56)

**Estimated effort:** 2 hours

---

_Last updated: 2026-02-23 by adam2am_
