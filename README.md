# bun-sqlite-for-rxdb

> Unofficial RxDB storage adapter for Bun's native SQLite (`bun:sqlite`)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

RxDB storage adapter that translates Mango queries directly to bun:sqlite (except of $regex), bypassing slow in-memory filtering.

## Features
- ✅ **17 Mango operators** directly using SQL ($eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $or, $and, $exists, $elemMatch, $not, $nor, $type, $size, $mod)
- ✅ **1 Mango operator optimized in memory** (complex $regex)
- ✅ **Smart regex** - converts simple patterns to SQL LIKE (uses indexes)
- ✅ **Attachments support** (base64 storage with digest validation)

- ✅ **Multi-instance support** with connection pooling
- ✅ **Dual LRU caching** - prepared statements + query AST parsing
- ✅ **Property-based testing** with fast-check (3000+ assertions vs Mingo and Sift.js)
- ✅ MIT licensed

## Performance

### Database Performance
Benchmarked against better-sqlite3 (1M documents, WAL mode + PRAGMA synchronous = 1):

| Operation | Bun SQLite | better-sqlite3 | Speedup |
|-----------|------------|----------------|---------|
| Bulk INSERT (1M docs) | 7.42s | 7.90s | **1.06x faster** |
| SELECT by ID (10K lookups) | 170ms | 170ms | Equal |
| Complex WHERE query | 484ms | 814ms | **1.68x faster** | 

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

## License

MIT © adam2am

## Contributing

Contributions welcome! This is a community project.

---

**Not affiliated with RxDB or Bun. Community-maintained adapter.**
