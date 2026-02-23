import { buildWhereClause } from '../src/query/builder';
import type { RxJsonSchema, MangoQuerySelector, RxDocumentData } from 'rxdb';

console.log("🏴‍☠️ Query Builder Performance Benchmark\n");

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

console.log("📊 Test: Build 100,000 queries (no cache)");
const iterations = 100_000;

const start = performance.now();
for (let i = 0; i < iterations; i++) {
  const query = queries[i % queries.length];
  buildWhereClause(query, schema);
}
const end = performance.now();
const totalTime = end - start;
const avgTime = totalTime / iterations;

console.log(`  Total time: ${totalTime.toFixed(2)}ms`);
console.log(`  Average per query: ${(avgTime * 1000).toFixed(2)}µs`);
console.log(`  Throughput: ${(iterations / (totalTime / 1000)).toFixed(0)} queries/sec\n`);

console.log("📊 Analysis:");
console.log(`  If caching saves 50% → ${(avgTime * 0.5 * 1000).toFixed(2)}µs saved per query`);
console.log(`  For 1M queries → ${(totalTime * 0.5 / 1000).toFixed(2)}s saved`);
console.log(`  Cache overhead: ~${(avgTime * 0.1 * 1000).toFixed(2)}µs (Map lookup)`);
console.log(`  Net benefit: ${((avgTime * 0.5 - avgTime * 0.1) * 1000).toFixed(2)}µs per query\n`);

console.log("✅ Conclusion:");
if (avgTime < 0.01) {
  console.log("  Query builder is VERY FAST (<10µs)");
  console.log("  Caching overhead likely > benefit");
  console.log("  Recommendation: SKIP caching (YAGNI)");
} else if (avgTime < 0.1) {
  console.log("  Query builder is FAST (<100µs)");
  console.log("  Caching might help for repeated queries");
  console.log("  Recommendation: Implement simple cache, measure impact");
} else {
  console.log("  Query builder is SLOW (>100µs)");
  console.log("  Caching will definitely help!");
  console.log("  Recommendation: Implement cache immediately");
}
