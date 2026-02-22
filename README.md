# bun-sqlite-for-rxdb

> Unofficial RxDB storage adapter for Bun's native SQLite (`bun:sqlite`)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- ✅ Uses Bun's native SQLite
- ✅ Zero npm dependencies (bun:sqlite is built-in)
- ✅ Full RxDB storage interface implementation
- ✅ Reactive queries with observables
- ✅ MIT licensed 

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
