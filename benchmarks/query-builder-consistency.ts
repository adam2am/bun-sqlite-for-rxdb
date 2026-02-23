import { buildWhereClause } from '../src/query/builder';
import type { RxJsonSchema, MangoQuerySelector, RxDocumentData } from 'rxdb';

console.log("🏴‍☠️ Query Builder Consistency Test (15 runs)\n");

type TestDoc = {
  id: string;
  name: string;
  age: number;
  email: string;
  status: string;
  _deleted: boolean;
  _attachments: {};
  _rev: string;
  _meta: { lwt: number };
};

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    age: { type: 'number' },
    email: { type: 'string' },
    status: { type: 'string' },
    _deleted: { type: 'boolean' },
    _attachments: { type: 'object' },
    _rev: { type: 'string' },
    _meta: {
      type: 'object',
      properties: {
        lwt: { type: 'number' }
      },
      required: ['lwt']
    }
  },
  required: ['id', 'name', 'age', '_deleted', '_rev', '_meta']
};

const queries: MangoQuerySelector<RxDocumentData<TestDoc>>[] = [
  { age: { $gt: 30 }, status: { $eq: 'active' } },
  { age: { $gte: 25, $lte: 50 } },
  { $or: [{ age: { $lt: 20 } }, { age: { $gt: 60 } }] },
  { $and: [{ status: { $eq: 'active' } }, { age: { $gte: 18 } }] },
  { name: { $regex: '^User' } },
  { age: { $in: [25, 30, 35, 40] } },
  { status: { $ne: 'deleted' } },
  { email: { $exists: true } }
];

const iterations = 100_000;
const runs = 15;
const times: number[] = [];

console.log(`Running ${runs} iterations of ${iterations.toLocaleString()} queries each...\n`);

for (let run = 0; run < runs; run++) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const query = queries[i % queries.length];
    buildWhereClause(query, schema);
  }
  const end = performance.now();
  const time = end - start;
  times.push(time);
  
  const avgPerQuery = (time / iterations) * 1000; // in microseconds
  console.log(`Run ${(run + 1).toString().padStart(2)}: ${time.toFixed(2).padStart(8)}ms total | ${avgPerQuery.toFixed(2).padStart(6)}µs per query`);
}

console.log("\n📊 Statistics:");
const avg = times.reduce((a, b) => a + b, 0) / times.length;
const min = Math.min(...times);
const max = Math.max(...times);
const sorted = [...times].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const stdDev = Math.sqrt(times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length);

console.log(`  Average:  ${avg.toFixed(2)}ms (${(avg / iterations * 1000).toFixed(2)}µs per query)`);
console.log(`  Median:   ${median.toFixed(2)}ms (${(median / iterations * 1000).toFixed(2)}µs per query)`);
console.log(`  Min:      ${min.toFixed(2)}ms (${(min / iterations * 1000).toFixed(2)}µs per query)`);
console.log(`  Max:      ${max.toFixed(2)}ms (${(max / iterations * 1000).toFixed(2)}µs per query)`);
console.log(`  Std Dev:  ${stdDev.toFixed(2)}ms`);
console.log(`  Variance: ${((max - min) / avg * 100).toFixed(1)}%`);

console.log("\n✅ Consistency Analysis:");
if (stdDev < avg * 0.1) {
  console.log("  VERY CONSISTENT (std dev < 10% of average)");
} else if (stdDev < avg * 0.2) {
  console.log("  CONSISTENT (std dev < 20% of average)");
} else {
  console.log("  INCONSISTENT (std dev > 20% of average)");
}

console.log("\n🔍 Cache Detection:");
const firstRun = times[0];
const avgLaterRuns = times.slice(1).reduce((a, b) => a + b, 0) / (times.length - 1);
const improvement = ((firstRun - avgLaterRuns) / firstRun * 100);

if (improvement > 50) {
  console.log(`  CACHE DETECTED! First run: ${firstRun.toFixed(2)}ms, Later runs: ${avgLaterRuns.toFixed(2)}ms`);
  console.log(`  Improvement: ${improvement.toFixed(1)}% faster after warmup`);
} else if (improvement > 10) {
  console.log(`  WARMUP DETECTED: ${improvement.toFixed(1)}% faster after first run (JIT optimization)`);
} else {
  console.log(`  NO CACHE: Performance consistent across all runs (${improvement.toFixed(1)}% variance)`);
}
