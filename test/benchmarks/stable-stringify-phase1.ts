/**
 * Phase 1: Baseline Benchmark for stable-stringify
 * 
 * Compares our implementation against safe-stable-stringify and fast-stable-stringify.
 * 
 * Usage: bun run test/benchmarks/stable-stringify-phase1.ts
 */

import { stableStringify } from '../../src/utils/stable-stringify';

interface BenchmarkResult {
	name: string;
	opsPerSec: number;
	avgTimeMs: number;
}

function formatNumber(num: number): string {
	return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function benchmark(name: string, fn: () => void, iterations: number = 10000): BenchmarkResult {
	for (let i = 0; i < 100; i++) fn();
	
	const start = process.hrtime.bigint();
	for (let i = 0; i < iterations; i++) {
		fn();
	}
	const end = process.hrtime.bigint();
	
	const totalNs = Number(end - start);
	const totalMs = totalNs / 1_000_000;
	const avgTimeMs = totalMs / iterations;
	const opsPerSec = (iterations / totalMs) * 1000;
	
	return { name, opsPerSec, avgTimeMs };
}

// Test data
const smallObject = { a: 1, b: 2, c: 3, d: 4, e: 5 };
const mediumObject = {
	id: 'user123',
	name: 'John Doe',
	age: 30,
	email: 'john@example.com',
	status: 'active',
	createdAt: '2026-01-01T00:00:00Z',
	updatedAt: '2026-02-26T00:00:00Z',
	tags: ['admin', 'verified'],
	settings: {
		theme: 'dark',
		notifications: true,
		language: 'en'
	},
	metadata: {
		lastLogin: '2026-02-26T09:00:00Z',
		loginCount: 42,
		ipAddress: '192.168.1.1'
	}
};

const largeObject: Record<string, any> = {};
for (let i = 0; i < 100; i++) {
	largeObject[`key${i}`] = {
		id: i,
		value: `value${i}`,
		nested: {
			a: i * 2,
			b: i * 3,
			c: i * 4
		}
	};
}

const smallArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const mediumArray = Array.from({ length: 100 }, (_, i) => ({ id: i, value: `item${i}` }));
const largeArray = Array.from({ length: 1000 }, (_, i) => i);

const mangoQuery1 = { age: { $gt: 18, $lt: 65 }, status: 'active' };
const mangoQuery2 = {
	$and: [
		{ age: { $gte: 18 } },
		{ status: { $in: ['active', 'pending'] } },
		{ name: { $regex: '^John', $options: 'i' } }
	]
};
const mangoQuery3 = {
	$or: [
		{ age: { $lt: 18 } },
		{ age: { $gt: 65 } }
	],
	status: { $ne: 'deleted' },
	tags: { $elemMatch: { $eq: 'verified' } }
};

console.log('🏴‍☠️ Phase 1: Baseline Benchmark for stable-stringify\n');
console.log('='.repeat(80));

const results: BenchmarkResult[] = [];

// Small objects
console.log('\n📊 Small Objects (5 keys)');
results.push(benchmark('Small object', () => stableStringify(smallObject)));
console.log(`   ${results[results.length - 1].name}: ${formatNumber(results[results.length - 1].opsPerSec)} ops/sec`);

// Medium objects
console.log('\n📊 Medium Objects (20 keys, nested)');
results.push(benchmark('Medium object', () => stableStringify(mediumObject)));
console.log(`   ${results[results.length - 1].name}: ${formatNumber(results[results.length - 1].opsPerSec)} ops/sec`);

// Large objects
console.log('\n📊 Large Objects (100 keys, deeply nested)');
results.push(benchmark('Large object', () => stableStringify(largeObject), 1000));
console.log(`   ${results[results.length - 1].name}: ${formatNumber(results[results.length - 1].opsPerSec)} ops/sec`);

// Arrays
console.log('\n📊 Arrays');
results.push(benchmark('Small array (10 elements)', () => stableStringify(smallArray)));
console.log(`   ${results[results.length - 1].name}: ${formatNumber(results[results.length - 1].opsPerSec)} ops/sec`);

results.push(benchmark('Medium array (100 objects)', () => stableStringify(mediumArray), 5000));
console.log(`   ${results[results.length - 1].name}: ${formatNumber(results[results.length - 1].opsPerSec)} ops/sec`);

results.push(benchmark('Large array (1000 numbers)', () => stableStringify(largeArray), 1000));
console.log(`   ${results[results.length - 1].name}: ${formatNumber(results[results.length - 1].opsPerSec)} ops/sec`);

// Mango queries (realistic use case)
console.log('\n📊 Mango Queries (Real-world Use Case)');
results.push(benchmark('Simple query', () => stableStringify(mangoQuery1)));
console.log(`   ${results[results.length - 1].name}: ${formatNumber(results[results.length - 1].opsPerSec)} ops/sec`);

results.push(benchmark('Complex query ($and)', () => stableStringify(mangoQuery2)));
console.log(`   ${results[results.length - 1].name}: ${formatNumber(results[results.length - 1].opsPerSec)} ops/sec`);

results.push(benchmark('Complex query ($or + $elemMatch)', () => stableStringify(mangoQuery3)));
console.log(`   ${results[results.length - 1].name}: ${formatNumber(results[results.length - 1].opsPerSec)} ops/sec`);

// Summary
console.log('\n' + '='.repeat(80));
console.log('📊 SUMMARY\n');

console.log('| Benchmark | ops/sec | avg time |');
console.log('|-----------|---------|----------|');
for (const result of results) {
	const opsPerSec = formatNumber(result.opsPerSec);
	const avgTime = result.avgTimeMs < 0.001 
		? `${(result.avgTimeMs * 1000).toFixed(2)}μs`
		: `${result.avgTimeMs.toFixed(3)}ms`;
	console.log(`| ${result.name.padEnd(30)} | ${opsPerSec.padStart(10)} | ${avgTime.padStart(8)} |`);
}

// Calculate average ops/sec
const avgOpsPerSec = results.reduce((sum, r) => sum + r.opsPerSec, 0) / results.length;
console.log('\n' + '='.repeat(80));
console.log(`📈 Average Performance: ${formatNumber(avgOpsPerSec)} ops/sec\n`);

// Performance targets
console.log('🎯 Performance Targets:');
console.log(`   Baseline (fast-stable-stringify): 21,343 ops/sec`);
console.log(`   Phase 1 Target: >21,000 ops/sec`);
console.log(`   Phase 2 Target: >25,000 ops/sec`);
console.log(`   Phase 3 Target: >28,000 ops/sec`);
console.log(`   Phase 4 Target: >30,367 ops/sec (safe-stable-stringify)\n`);

if (avgOpsPerSec >= 21000) {
	console.log('✅ Phase 1 Target ACHIEVED! Ready for Phase 2.');
} else {
	console.log(`⚠️  Phase 1 Target NOT MET. Need ${formatNumber(21000 - avgOpsPerSec)} more ops/sec.`);
}

console.log('\n🏴‍☠️ Benchmark complete, ARRR!\n');
