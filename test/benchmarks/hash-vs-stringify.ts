/**
 * Benchmark: Bun.hash() vs stableStringify for cache key generation
 * Tests real Mango query selectors to measure:
 * - Key generation speed (ops/sec)
 * - Memory usage (key size in bytes)
 */

import { stableStringify } from '$app/utils/stable-stringify';
import type { MangoQuerySelector, RxDocumentData } from 'rxdb';

interface TestDoc {
	id: string;
	name: string;
	age: number;
	email?: string;
	status: string;
	tags?: string[];
}

// Real-world Mango selectors from test suite
const selectors: MangoQuerySelector<RxDocumentData<TestDoc>>[] = [
	{ age: { $gt: 18 } },
	{ name: { $regex: '^A' } },
	{ age: { $gte: 18, $lte: 65 } },
	{ $and: [{ age: { $gt: 18 } }, { status: 'active' }] },
	{ $or: [{ age: { $lt: 18 } }, { age: { $gt: 65 } }] },
	{ tags: { $in: ['admin', 'moderator'] } },
	{ email: { $exists: true } },
	{ name: { $regex: '^[A-Z]', $options: 'i' } },
	{ $and: [{ age: { $gte: 25 } }, { $or: [{ status: 'active' }, { status: 'pending' }] }] },
	{ age: { $mod: [2, 0] } },
	{ name: { $ne: 'test' } },
	{ tags: { $size: 3 } },
	{ status: { $eq: 'admin' } },
	{ age: { $in: [18, 21, 25, 30, 35] } },
	{ $nor: [{ age: { $lt: 18 } }, { status: 'banned' }] },
];

function benchmarkKeyGeneration(name: string, fn: (selector: any) => string | number | bigint, iterations: number) {
	const start = performance.now();
	
	for (let i = 0; i < iterations; i++) {
		for (const selector of selectors) {
			fn(selector);
		}
	}
	
	const end = performance.now();
	const totalOps = iterations * selectors.length;
	const timeMs = end - start;
	const opsPerSec = (totalOps / timeMs) * 1000;
	
	// Measure key sizes
	const keys = selectors.map(fn);
	const avgKeySize = keys.reduce((sum: number, key) => {
		const size = typeof key === 'string' ? key.length * 2 : 8; // UTF-16 or 8 bytes for number/bigint
		return sum + size;
	}, 0) / keys.length;
	
	return {
		name,
		timeMs: timeMs.toFixed(2),
		opsPerSec: Math.round(opsPerSec).toLocaleString(),
		avgKeySize: Math.round(avgKeySize),
		sampleKey: keys[0]
	};
}

console.log('🔥 Cache Key Generation Benchmark\n');
console.log(`Selectors: ${selectors.length} real Mango queries`);
console.log(`Iterations: 10,000 per strategy\n`);

const iterations = 10000;

// Strategy 1: stableStringify (current)
const result1 = benchmarkKeyGeneration(
	'stableStringify',
	(selector) => stableStringify(selector),
	iterations
);

// Strategy 2: Bun.hash(stableStringify) (proposed)
const result2 = benchmarkKeyGeneration(
	'Bun.hash(stableStringify)',
	(selector) => Bun.hash(stableStringify(selector)),
	iterations
);

// Strategy 3: Bun.hash(JSON.stringify) (alternative - UNSAFE, order matters)
const result3 = benchmarkKeyGeneration(
	'Bun.hash(JSON.stringify)',
	(selector) => Bun.hash(JSON.stringify(selector)),
	iterations
);

console.log('Results:\n');
console.log(`1. ${result1.name}`);
console.log(`   Time: ${result1.timeMs}ms`);
console.log(`   Speed: ${result1.opsPerSec} ops/sec`);
console.log(`   Avg key size: ${result1.avgKeySize} bytes`);
console.log(`   Sample: ${result1.sampleKey}\n`);

console.log(`2. ${result2.name}`);
console.log(`   Time: ${result2.timeMs}ms`);
console.log(`   Speed: ${result2.opsPerSec} ops/sec`);
console.log(`   Avg key size: ${result2.avgKeySize} bytes`);
console.log(`   Sample: ${result2.sampleKey}\n`);

console.log(`3. ${result3.name} ⚠️ UNSAFE - key order matters`);
console.log(`   Time: ${result3.timeMs}ms`);
console.log(`   Speed: ${result3.opsPerSec} ops/sec`);
console.log(`   Avg key size: ${result3.avgKeySize} bytes`);
console.log(`   Sample: ${result3.sampleKey}\n`);

// Calculate improvements
const speedup2 = (parseFloat(result1.timeMs) / parseFloat(result2.timeMs)).toFixed(2);
const memSavings2 = (((result1.avgKeySize - result2.avgKeySize) / result1.avgKeySize) * 100).toFixed(1);

const speedup3 = (parseFloat(result1.timeMs) / parseFloat(result3.timeMs)).toFixed(2);
const memSavings3 = (((result1.avgKeySize - result3.avgKeySize) / result1.avgKeySize) * 100).toFixed(1);

console.log('Analysis:\n');
console.log(`Bun.hash(stableStringify) vs stableStringify:`);
console.log(`  Speed: ${speedup2}x ${parseFloat(speedup2) > 1 ? 'faster' : 'slower'}`);
console.log(`  Memory: ${memSavings2}% ${parseFloat(memSavings2) > 0 ? 'smaller' : 'larger'}\n`);

console.log(`Bun.hash(JSON.stringify) vs stableStringify:`);
console.log(`  Speed: ${speedup3}x ${parseFloat(speedup3) > 1 ? 'faster' : 'slower'}`);
console.log(`  Memory: ${memSavings3}% ${parseFloat(memSavings3) > 0 ? 'smaller' : 'larger'}`);
console.log(`  ⚠️  WARNING: Unsafe - { a: 1, b: 2 } !== { b: 2, a: 1 }\n`);

console.log('Recommendation:');
if (parseFloat(speedup2) > 1.2 && parseFloat(memSavings2) > 50) {
	console.log('✅ Use Bun.hash(stableStringify) - significant gains in speed and memory');
} else if (parseFloat(speedup2) > 1.0) {
	console.log('⚖️  Bun.hash(stableStringify) is faster but gains are modest');
} else {
	console.log('❌ Keep stableStringify - hashing adds overhead without benefit');
}
