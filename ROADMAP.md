# bun-sqlite-for-rxdb Roadmap

> **Status:** v1.4.0 Shipped ✅ | 520+ tests passing | Property-based testing validated
> **Last Updated:** 2026-02-27

---

## 🎯 Vision

Build the **fastest RxDB storage adapter** by leveraging Bun's native SQLite.

**Principles:**
- Measure before optimizing
- Ship working code
- Test-driven development

---

## ✅ Current Status (v1.4.0)

**Core Features:**
- ✅ **520+ tests passing** (138 local + 122 official RxDB + 260 property-based)
- ✅ **244x faster LIMIT queries** with lazy iteration (0.16ms vs 38.99ms)
- ✅ **18 Mango operators** translated to SQL ($eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $or, $and, $exists, $regex, $elemMatch, $not, $nor, $type, $size, $mod)
- ✅ **Property-based testing** with fast-check (3000+ assertions vs Mingo and Sift.js)
- ✅ **Lightweight matcher** (103 lines, replaces RxDB's getQueryMatcher)
- ✅ **Statement cache optimization** (json_each for $in/$nin prevents thrashing)
- ✅ **Attachments support** (base64 storage with digest validation)
- ✅ **Multi-instance support** with connection pooling
- ✅ **1.06-1.68x faster than better-sqlite3** (with WAL mode)

**Architecture:**
- SQL translation for all operators (no Mingo dependency)
- Lazy iteration with early termination for LIMIT queries
- Dual LRU caching (prepared statements + query AST parsing)
- JSONB storage with json_each() for arrays
- Smart regex (simple patterns → SQL LIKE, complex → JavaScript)

---

## 🚀 Future Enhancements

### High Priority

**1. Read-Replica Worker Threads** (Issue #6 - docs/id8-robustness.md)
- SQLite WAL mode supports one writer + multiple readers concurrently
- Use Bun Workers to route queries to read-only connections on separate threads
- True multi-core scalability
- **Status:** Ready to implement (high confidence, proven architecture)

### Medium Priority

**2. Zero-Copy Deserialization** (Issue #5 - docs/id8-robustness.md)
- Profile JSON.parse overhead first (senior claims 60% of query time)
- Investigate Bun FFI for zero-copy SQLite results
- **Status:** Needs profiling before implementation

### ?????

**3. Ring-Buffer Statement Cache** (Issue #7 - docs/id8-robustness.md)
- No evidence that Map causes GC churn at our scale
- **Status:** ???? (premature optimization)

**4. Pre-Compiled Query Strategy Cache** (Issue #8 - docs/id8-robustness.md)
- Already implemented in StatementManager
- **Status:** Already done

---

## 🤝 Contributing

Test with your RxDB app, report bugs, submit PRs, share benchmarks.

---

**Not affiliated with RxDB or Bun. Community-maintained adapter.**

_Last updated: 2026-02-27 by adam2am_
