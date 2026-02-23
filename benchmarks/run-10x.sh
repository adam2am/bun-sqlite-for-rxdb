#!/bin/bash

echo "🏴‍☠️ Running Benchmarks 10 Times for Consistency Check"
echo ""

echo "=== Bun SQLite (10 runs) ==="
for i in {1..10}; do
  echo "Run $i:"
  bun run benchmarks/raw-bun-sqlite.ts | grep "Summary:" -A 4
  echo ""
done

echo ""
echo "=== better-sqlite3 (10 runs) ==="
for i in {1..10}; do
  echo "Run $i:"
  node benchmarks/raw-better-sqlite3.ts | grep "Summary:" -A 4
  echo ""
done
