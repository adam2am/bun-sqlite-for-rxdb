# RxDB Official Test Suite Setup for Bun

**Status:** ✅ 112/112 tests pass (100%)  
**Last Updated:** 2026-02-23  
**RxDB Version:** 16.21.1  
**Bun Version:** 1.3.9+

---

## Quick Start

```bash
cd .ignoreFolder/rxdb

# 1. Apply fixes to source config
# (See "Applying Fixes" section below)

# 2. Transpile TypeScript to JavaScript
npm run transpile

# 3. Run tests with Mocha through Bun
DEFAULT_STORAGE=custom NODE_ENV=fast bun run ./node_modules/mocha/bin/mocha test_tmp/unit/rx-storage-implementations.test.js --bail --timeout 60000
```

**Expected Result:** 112 passing tests

---

## The Problem

RxDB's official test suite has two Bun compatibility issues:

### Issue #1: `node:sqlite` Import
```javascript
// test/unit/config.ts - sqlite-trial case
const nativeSqlitePromise = await import('node:sqlite');  // ❌ Fails in Bun
```

**Error:** `Could not resolve: "node:sqlite". Maybe you need to "bun install"?`

**Why:** Bun uses `bun:sqlite`, not `node:sqlite`. The import fails at parse time even if never executed.

### Issue #2: Missing Test Globals
```javascript
// Tests expect describe/it/expect as globals (Mocha provides them)
describe('test suite', () => {  // ❌ ReferenceError: describe is not defined
  it('should work', () => {
    expect(true).toBe(true);
  });
});
```

**Why:** When running Mocha through Bun, globals aren't automatically available unless Mocha is properly initialized.

---

## The Solution

### Fix #1: Skip `node:sqlite` in Bun

**File:** `test/unit/config.ts`  
**Location:** sqlite-trial case (around line 305)

```typescript
case 'sqlite-trial':
    if (isBun) {
        return {
            name: storageKey,
            async init() {
                throw new Error('sqlite-trial storage uses node:sqlite which is not compatible with Bun. Use DEFAULT_STORAGE=custom instead.');
            },
            getStorage() {
                throw new Error('sqlite-trial storage is not available in Bun.');
            },
            getPerformanceStorage() {
                throw new Error('sqlite-trial storage is not available in Bun.');
            },
            hasPersistence: false,
            hasMultiInstance: false,
            hasAttachments: false,
            hasReplication: false
        };
    }
    
    let initDone = false;
    let sqliteStorage: any;
    let sqliteBasics;
    return {
        name: storageKey,
        async init() {
            if (initDone) return;
            initDone = true;
            
            const nativeSqlitePromise = await import('node:sqlite').then(module => module.DatabaseSync);
            // ... rest of init
        },
        // ... rest of config
    };
```

**Key Points:**
- Early return when `isBun` is true
- Prevents `import('node:sqlite')` from being parsed
- Throws clear error if someone tries to use sqlite-trial in Bun

### Fix #2: Conditional Bun Test Imports

**File:** `test/unit/config.ts`  
**Location:** After imports (around line 35)

```typescript
import {
    DEFAULT_STORAGE,
    ENV_VARIABLES,
    getConfig,
    isDeno,
    isBun,
    isFastMode,
    isNode,
    setConfig
} from '../../plugins/test-utils/index.mjs';

// Only import Bun test globals if running with native bun test (not mocha)
if (typeof Bun !== 'undefined' && typeof describe === 'undefined') {
    const { describe: bunDescribe, it: bunIt, expect: bunExpect, beforeEach: bunBeforeEach, afterEach: bunAfterEach } = await import('bun:test');
    globalThis.describe = bunDescribe;
    globalThis.it = bunIt;
    globalThis.expect = bunExpect;
    globalThis.beforeEach = bunBeforeEach;
    globalThis.afterEach = bunAfterEach;
}
```

**Key Points:**
- Only imports Bun test globals if `describe` is undefined
- Prevents overriding Mocha's globals when running Mocha through Bun
- Allows both `bun test` and `bun run mocha` to work

---

## Applying Fixes

### Step 1: Add `isBun` to Imports

**File:** `test/unit/config.ts` (line ~34)

```typescript
// BEFORE:
import {
    DEFAULT_STORAGE,
    ENV_VARIABLES,
    getConfig,
    isDeno,
    isFastMode,
    isNode,
    setConfig
} from '../../plugins/test-utils/index.mjs';

// AFTER:
import {
    DEFAULT_STORAGE,
    ENV_VARIABLES,
    getConfig,
    isDeno,
    isBun,  // ← ADD THIS
    isFastMode,
    isNode,
    setConfig
} from '../../plugins/test-utils/index.mjs';
```

### Step 2: Add Conditional Bun Test Imports

**File:** `test/unit/config.ts` (after imports, around line 35)

Add this block:
```typescript
if (typeof Bun !== 'undefined' && typeof describe === 'undefined') {
    const { describe: bunDescribe, it: bunIt, expect: bunExpect, beforeEach: bunBeforeEach, afterEach: bunAfterEach } = await import('bun:test');
    globalThis.describe = bunDescribe;
    globalThis.it = bunIt;
    globalThis.expect = bunExpect;
    globalThis.beforeEach = bunBeforeEach;
    globalThis.afterEach = bunAfterEach;
}
```

### Step 3: Add Bun Check in sqlite-trial Case

**File:** `test/unit/config.ts` (sqlite-trial case, around line 305)

Add early return at the start of the case:
```typescript
case 'sqlite-trial':
    if (isBun) {
        return {
            name: storageKey,
            async init() {
                throw new Error('sqlite-trial storage uses node:sqlite which is not compatible with Bun. Use DEFAULT_STORAGE=custom instead.');
            },
            getStorage() {
                throw new Error('sqlite-trial storage is not available in Bun.');
            },
            getPerformanceStorage() {
                throw new Error('sqlite-trial storage is not available in Bun.');
            },
            hasPersistence: false,
            hasMultiInstance: false,
            hasAttachments: false,
            hasReplication: false
        };
    }
    
    // ... existing code continues
```

### Step 4: Transpile

```bash
cd .ignoreFolder/rxdb
npm run transpile
```

This regenerates `test_tmp/unit/config.js` with your fixes.

---

## Running Tests

### Method 1: Mocha through Bun (Recommended)

```bash
cd .ignoreFolder/rxdb
DEFAULT_STORAGE=custom NODE_ENV=fast bun run ./node_modules/mocha/bin/mocha test_tmp/unit/rx-storage-implementations.test.js --bail --timeout 60000
```

**Result:** 112/112 tests pass ✅

**Why this works:**
- Runs Mocha's test runner through Bun's runtime
- Mocha provides its own globals (describe/it/expect)
- Mocha supports `this.timeout()` and other Mocha-specific features
- Our conditional imports don't interfere (describe is already defined)

### Method 2: Native Bun Test (Alternative)

```bash
cd .ignoreFolder/rxdb
DEFAULT_STORAGE=custom bun test test_tmp/unit/rx-storage-implementations.test.js
```

**Result:** 55/56 tests pass (98.2%)

**Why one test fails:**
- One test uses `this.timeout(30 * 1000)` which is Mocha-specific
- Bun's test framework doesn't support `this.timeout()`
- Bun uses Jest-style timeouts: `test('name', () => {}, 30000)`

**When to use:**
- Quick smoke tests
- When you don't need 100% compatibility
- When testing Bun-specific features

---

## Test Commands Reference

```bash
# Full test suite (all storages)
npm run test

# Transpile TypeScript
npm run transpile

# Test with custom storage (our Bun SQLite adapter)
DEFAULT_STORAGE=custom NODE_ENV=fast bun run ./node_modules/mocha/bin/mocha test_tmp/unit/rx-storage-implementations.test.js --bail --timeout 60000

# Test with native bun test (55/56 pass)
DEFAULT_STORAGE=custom bun test test_tmp/unit/rx-storage-implementations.test.js
cd "C:\OPPROJ\bun-sqlite-for-rxdb\.ignoreFolder\rxdb" && DEFAULT_STORAGE=custom bun test "test_tmp\unit\rx-storage-query-correctness.test.ts"

# Test specific storage (from package.json)
npm run test:bun:dexie
npm run test:bun:memory
```

---

## Troubleshooting

### Error: `Could not resolve: "node:sqlite"`

**Cause:** You didn't apply Fix #1 or didn't transpile after applying it.

**Solution:**
1. Add Bun check in sqlite-trial case (see Fix #1)
2. Run `npm run transpile`
3. Verify fix is in `test_tmp/unit/config.js`

### Error: `describe is not defined`

**Cause:** You didn't apply Fix #2 or didn't transpile after applying it.

**Solution:**
1. Add conditional Bun imports (see Fix #2)
2. Run `npm run transpile`
3. Verify imports are in `test_tmp/unit/config.js`

### Error: `0 passing tests` when running Mocha

**Cause:** Bun test globals are overriding Mocha's globals.

**Solution:**
- Check that conditional import has `typeof describe === 'undefined'` check
- This prevents Bun imports when Mocha already provides globals

### Tests pass locally but fail after `npm run transpile`

**Cause:** You edited `test_tmp/unit/config.js` directly (transpiled output).

**Solution:**
- Always edit `test/unit/config.ts` (source file)
- Then run `npm run transpile` to regenerate output
- Never edit files in `test_tmp/` directly

---

## Architecture Notes

### Why Mocha Through Bun?

RxDB's test suite is designed for Mocha:
- Uses Mocha's `describe/it/expect` globals
- Uses Mocha-specific features (`this.timeout()`, `this.skip()`)
- Uses `mocha.parallel` for parallel test execution
- Has `.mocharc.cjs` configuration

**Running Mocha through Bun gives us:**
- ✅ Full Mocha compatibility (100% tests pass)
- ✅ Bun's fast runtime (faster than Node.js)
- ✅ Access to Bun-specific APIs (`bun:sqlite`)
- ✅ No test rewrites needed

### Why Not Native `bun test`?

Bun's test framework is Jest/Vitest-compatible, not Mocha-compatible:
- Different timeout syntax
- Different global setup
- Different assertion library
- Would require rewriting all tests

**Use native `bun test` when:**
- Writing new Bun-specific tests
- Quick smoke tests (98.2% pass rate is acceptable)
- Testing Bun-specific features

### Why Conditional Imports?

```typescript
if (typeof Bun !== 'undefined' && typeof describe === 'undefined') {
    // Import Bun test globals
}
```

**The check ensures:**
1. `typeof Bun !== 'undefined'` → We're running in Bun
2. `typeof describe === 'undefined'` → Mocha hasn't provided globals yet

**This allows:**
- `bun test` → Imports Bun globals (describe is undefined)
- `bun run mocha` → Skips import (describe already defined by Mocha)

---

## Related Documentation

- [id1-testsuite-journey.md](./id1-testsuite-journey.md) - Debugging journey (Iterations 1-14)
- [architectural-patterns.md](./architectural-patterns.md) - Storage adapter patterns
- [RxDB Official Docs](https://rxdb.info/) - RxDB documentation
- [Bun Test Docs](https://bun.sh/docs/test/writing-tests) - Bun test framework

---

## Changelog

### 2026-02-23 - Initial Setup
- Added Bun compatibility fixes to config.ts
- Documented test setup process
- Achieved 112/112 tests passing with Mocha through Bun
- Documented alternative native `bun test` approach (55/56 pass)

---

_Last updated: 2026-02-23 by adam2am_
