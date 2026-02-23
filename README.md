# bun-sqlite-for-rxdb

> Unofficial RxDB storage adapter for Bun's native SQLite (`bun:sqlite`)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- ✅ Uses Bun's native SQLite
- ✅ **260/260 tests passing** (138 local + 122 official RxDB tests)
- ✅ Full RxDB storage interface implementation
- ✅ **Attachments support** (base64 storage with digest validation)
- ✅ **Query builder LRU cache** (5.2-57.9x speedup for repeated queries)
- ✅ **18 Mango operators** ($eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $or, $and, $exists, $regex, $elemMatch, $not, $nor, $type, $size, $mod)
- ✅ **Multi-instance support** with connection pooling
- ✅ **1.06-1.68x faster than better-sqlite3** (with WAL mode)
- ✅ MIT licensed

## Performance

Benchmarked against better-sqlite3 (1M documents, WAL mode + PRAGMA synchronous = 1):

| Operation | Bun SQLite | better-sqlite3 | Speedup |
|-----------|------------|----------------|---------|
| Bulk INSERT (1M docs) | 7.42s | 7.90s | **1.06x faster** |
| SELECT by ID (10K lookups) | 170ms | 170ms | Equal |
| Complex WHERE query | 484ms | 814ms | **1.68x faster** |

**Requirements for optimal performance:**
```typescript
db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA synchronous = 1");
``` 

## Installation

```bash
bun add bun-sqlite-for-rxdb
```

## Usage

```typescript
import { createRxDatabase } from 'rxdb';
import { getRxStorageBunSQLite } from 'bun-sqlite-for-rxdb';

const db = await createRxDatabase({
  name: 'mydb',
  storage: getRxStorageBunSQLite()
});
```

## Development

```bash
# Install dependencies
bun install

# Build
bun run build

# Test
bun test

# Type check
bun run typecheck
```

## Architecture

**Key components:**
- `RxStorage` factory
- `RxStorageInstance` implementation (11 required methods)
- Mango query → SQL translator
- Change stream observables

## License

MIT © adam2am

## Contributing

Contributions welcome! This is a community project.

---

**Not affiliated with RxDB or Bun. Community-maintained adapter.**
