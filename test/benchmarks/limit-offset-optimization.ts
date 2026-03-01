import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData } from 'rxdb';

interface BenchmarkDocType {
	id: string;
	name: string;
	age: number;
	status: string;
	_deleted: boolean;
	_attachments: {};
	_rev: string;
	_meta: { lwt: number };
}

async function setupTestData(docCount: number) {
	const storage = getRxStorageBunSQLite();
	const instance = await storage.createStorageInstance<BenchmarkDocType>({
		databaseInstanceToken: `limit-offset-opt-${Date.now()}`,
		databaseName: 'benchmark',
		collectionName: 'users',
		schema: {
			version: 0,
			primaryKey: 'id',
			type: 'object',
			properties: {
				id: { type: 'string', maxLength: 100 },
				name: { type: 'string' },
				age: { type: 'number' },
				status: { type: 'string' },
				_deleted: { type: 'boolean' },
				_attachments: { type: 'object' },
				_rev: { type: 'string' },
				_meta: {
					type: 'object',
					properties: {
						lwt: { type: 'number' }
					}
				}
			},
			required: ['id', 'name', 'age', 'status', '_deleted', '_attachments', '_rev', '_meta']
		},
		options: {},
		multiInstance: false,
		devMode: false
	});

	console.log(`📝 Inserting ${docCount.toLocaleString()} documents...`);
	const docs: Array<{ document: RxDocumentData<BenchmarkDocType> }> = [];
	
	for (let i = 0; i < docCount; i++) {
		docs.push({
			document: {
				id: `user${i}`,
				name: `Alice${i % 100}`,
				age: 18 + (i % 50),
				status: i % 2 === 0 ? 'active' : 'inactive',
				_deleted: false,
				_attachments: {},
				_rev: '1-abc',
				_meta: { lwt: Date.now() }
			}
		});
	}
	
	await instance.bulkWrite(docs, 'benchmark');
	console.log(`✅ Inserted ${docCount.toLocaleString()} documents\n`);
	
	return instance;
}

async function runBenchmark(instance: any, docCount: number) {
	console.log('='.repeat(80));
	console.log(`🏴‍☠️ LIMIT/OFFSET OPTIMIZATION BENCHMARK (${docCount.toLocaleString()} docs)`);
	console.log('='.repeat(80));
	console.log('Measuring: Query performance with LIMIT pushed to SQL vs JS slicing\n');

	const tests = [
		{
			name: 'Small LIMIT (10) on large result set (50k active)',
			selector: { status: 'active' },
			limit: 10,
			skip: 0,
			description: 'Before: Fetch 50k rows → slice to 10 in JS\nAfter: SQL LIMIT 10 → fetch only 10 rows'
		},
		{
			name: 'LIMIT with SKIP (pagination)',
			selector: { status: 'active' },
			limit: 20,
			skip: 1000,
			description: 'Before: Fetch 50k rows → slice [1000:1020] in JS\nAfter: SQL LIMIT 20 OFFSET 1000'
		},
		{
			name: 'Large LIMIT (1000) on large result set',
			selector: { status: 'active' },
			limit: 1000,
			skip: 0,
			description: 'Before: Fetch 50k rows → slice to 1000 in JS\nAfter: SQL LIMIT 1000'
		},
		{
			name: 'No LIMIT (fetch all)',
			selector: { status: 'active' },
			limit: undefined,
			skip: 0,
			description: 'Control: Should be same speed (no optimization applied)'
		},
		{
			name: 'Mixed query (SQL + regex) with LIMIT',
			selector: { status: 'active', name: { $regex: '^Alice[0-9]$' } },
			limit: 10,
			skip: 0,
			description: 'Should NOT push LIMIT to SQL (jsSelector !== null)\nMust apply LIMIT in JS after regex filtering'
		}
	];

	const results: Array<{ name: string; median: number; count: number }> = [];

	for (const test of tests) {
		console.log(`\n📊 ${test.name}`);
		console.log(`   ${test.description.split('\n').join('\n   ')}`);
		
		const iterations = 20;
		const times: number[] = [];
		let resultCount = 0;

		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			const result = await instance.query({
				query: { 
					selector: test.selector, 
					sort: [{ id: 'asc' }], 
					skip: test.skip,
					limit: test.limit
				},
				queryPlan: { 
					index: [], 
					startKeys: [], 
					endKeys: [], 
					inclusiveStart: true, 
					inclusiveEnd: true, 
					sortSatisfiedByIndex: false, 
					selectorSatisfiedByIndex: false 
				}
			});
			const end = performance.now();
			
			times.push(end - start);
			resultCount = result.documents.length;
		}

		times.sort((a, b) => a - b);
		const medianTime = times[Math.floor(iterations / 2)];
		const avgTime = times.reduce((a, b) => a + b, 0) / iterations;
		const minTime = times[0];
		const maxTime = times[iterations - 1];

		console.log(`   ⏱️  Median: ${medianTime.toFixed(2)}ms | Avg: ${avgTime.toFixed(2)}ms | Min: ${minTime.toFixed(2)}ms | Max: ${maxTime.toFixed(2)}ms`);
		console.log(`   📄 Returned: ${resultCount} documents`);

		results.push({ name: test.name, median: medianTime, count: resultCount });
	}

	console.log('\n' + '='.repeat(80));
	console.log('📈 SUMMARY');
	console.log('='.repeat(80));
	
	const smallLimit = results.find(r => r.name.includes('Small LIMIT'))!;
	const withSkip = results.find(r => r.name.includes('LIMIT with SKIP'))!;
	const largeLimit = results.find(r => r.name.includes('Large LIMIT'))!;
	const noLimit = results.find(r => r.name.includes('No LIMIT'))!;
	const mixed = results.find(r => r.name.includes('Mixed query'))!;

	console.log(`\nSmall LIMIT (10):      ${smallLimit.median.toFixed(2)}ms (${smallLimit.count} docs)`);
	console.log(`LIMIT + SKIP:          ${withSkip.median.toFixed(2)}ms (${withSkip.count} docs)`);
	console.log(`Large LIMIT (1000):    ${largeLimit.median.toFixed(2)}ms (${largeLimit.count} docs)`);
	console.log(`No LIMIT (all):        ${noLimit.median.toFixed(2)}ms (${noLimit.count} docs)`);
	console.log(`Mixed (SQL+regex):     ${mixed.median.toFixed(2)}ms (${mixed.count} docs)`);
	
	const speedup = noLimit.median / smallLimit.median;
	console.log(`\n🚀 Small LIMIT speedup: ${speedup.toFixed(1)}x faster than fetching all`);
	console.log(`   (${noLimit.median.toFixed(2)}ms → ${smallLimit.median.toFixed(2)}ms)`);

	console.log('\n💡 OPTIMIZATION IMPACT:');
	console.log(`   Before: Fetch ${(docCount / 2).toLocaleString()} rows → slice to ${smallLimit.count} in JS`);
	console.log(`   After:  SQL LIMIT ${smallLimit.count} → fetch only ${smallLimit.count} rows`);
	console.log(`   Data transfer reduction: ${((docCount / 2) / smallLimit.count).toFixed(0)}x less`);
}

async function main() {
	console.log('\n🏴‍☠️ LIMIT/OFFSET Optimization - Performance Benchmark');
	console.log('Measuring impact of pushing LIMIT/OFFSET to SQL\n');
	
	const instance = await setupTestData(100000);
	await runBenchmark(instance, 100000);
	await instance.close();
	
	console.log('\n' + '='.repeat(80));
	console.log('✅ BENCHMARK COMPLETE');
	console.log('='.repeat(80));
	console.log('\nOptimization: Push LIMIT/OFFSET to SQL when jsSelector === null\n');
}

main().catch(console.error);
