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
		databaseInstanceToken: `partial-pushdown-baseline-${Date.now()}`,
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
	console.log(`🏴‍☠️ PARTIAL SQL PUSHDOWN BASELINE (${docCount.toLocaleString()} docs)`);
	console.log('='.repeat(80));
	console.log('Measuring: Query time for mixed SQL + regex operators (20 runs, median)\n');

	const tests = [
		{
			name: 'Pure SQL (baseline)',
			selector: { status: 'active' },
			description: 'Should use SQLite index - FAST'
		},
		{
			name: 'Pure regex (baseline)',
			selector: { name: { $regex: '^Alice[0-9]$' } },
			description: 'Falls back to queryWithOurMemory - fetches ALL rows'
		},
		{
			name: 'Mixed: SQL + regex (THE KEY TEST)',
			selector: { status: 'active', name: { $regex: '^Alice[0-9]$' } },
			description: 'Currently: Fetches ALL rows (because of regex)\nShould: Fetch only active rows, then filter with regex'
		},
		{
			name: 'Mixed: Multiple SQL + regex',
			selector: { status: 'active', age: { $gt: 30 }, name: { $regex: '^Alice[1-5]' } },
			description: 'Currently: Fetches ALL rows\nShould: Use SQL for status + age, then regex filter'
		},
		{
			name: 'Mixed: $and with SQL + regex',
			selector: { $and: [{ status: 'active' }, { age: { $gte: 25 } }, { name: { $regex: '^Alice' } }] },
			description: 'Currently: Fetches ALL rows\nShould: SQL filters first, then regex'
		}
	];

	const results: Array<{ name: string; time: number; count: number }> = [];

	for (const test of tests) {
		console.log(`\n📊 ${test.name}`);
		console.log(`   ${test.description.split('\n').join('\n   ')}`);
		
		const iterations = 20;
		const times: number[] = [];
		let resultCount = 0;

		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			const result = await instance.query({
				query: { selector: test.selector, sort: [], skip: 0 },
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
		console.log(`   📄 Found: ${resultCount} documents`);

		results.push({ name: test.name, time: medianTime, count: resultCount });
	}

	console.log('\n' + '='.repeat(80));
	console.log('📈 SUMMARY');
	console.log('='.repeat(80));
	
	const pureSql = results.find(r => r.name === 'Pure SQL (baseline)')!;
	const pureRegex = results.find(r => r.name === 'Pure regex (baseline)')!;
	const mixedKey = results.find(r => r.name === 'Mixed: SQL + regex (THE KEY TEST)')!;

	console.log(`\nPure SQL query:        ${pureSql.time.toFixed(2)}ms (${pureSql.count} docs)`);
	console.log(`Pure regex query:      ${pureRegex.time.toFixed(2)}ms (${pureRegex.count} docs)`);
	console.log(`Mixed SQL + regex:     ${mixedKey.time.toFixed(2)}ms (${mixedKey.count} docs)`);
	
	const slowdown = ((mixedKey.time / pureSql.time) - 1) * 100;
	console.log(`\n⚠️  Mixed query is ${slowdown.toFixed(0)}% slower than pure SQL`);
	console.log(`    (Should be close to pure SQL time after partial pushdown fix)`);

	console.log('\n💡 EXPECTED IMPROVEMENT AFTER FIX:');
	console.log(`   Current: ${mixedKey.time.toFixed(2)}ms (fetches ALL ${docCount.toLocaleString()} rows)`);
	console.log(`   After:   ~${pureSql.time.toFixed(2)}ms (fetches only ${pureSql.count.toLocaleString()} active rows)`);
	console.log(`   Speedup: ${(mixedKey.time / pureSql.time).toFixed(1)}x faster`);
}

async function main() {
	console.log('\n🏴‍☠️ Partial SQL Pushdown - BASELINE BENCHMARK');
	console.log('Measuring BEFORE implementing bipartite query splitting\n');
	
	const instance = await setupTestData(100000);
	await runBenchmark(instance, 100000);
	await instance.close();
	
	console.log('\n' + '='.repeat(80));
	console.log('✅ BASELINE ESTABLISHED');
	console.log('='.repeat(80));
	console.log('\nNext: Implement partial SQL pushdown, then re-run to measure improvement\n');
}

main().catch(console.error);
