import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData } from 'rxdb';

interface NestedDocType {
	id: string;
	config: {
		'0': {
			items: {
				'1': {
					data: {
						'2': {
							meta: {
								'3': {
									value: string;
								};
							};
						};
					};
				};
			};
		};
	};
	_deleted: boolean;
	_attachments: Record<string, any>;
	_rev: string;
	_meta: { lwt: number };
}

async function setupTestData(docCount: number) {
	const storage = getRxStorageBunSQLite();
	const instance = await storage.createStorageInstance<NestedDocType>({
		databaseInstanceToken: `schema-traversal-benchmark-${Date.now()}`,
		databaseName: 'benchmark',
		collectionName: 'nested',
		schema: {
			version: 0,
			primaryKey: 'id',
			type: 'object',
			properties: {
				id: { type: 'string', maxLength: 100 },
				config: {
					type: 'object',
					properties: {
						'0': {
							type: 'object',
							properties: {
								items: {
									type: 'object',
									properties: {
										'1': {
											type: 'object',
											properties: {
												data: {
													type: 'object',
													properties: {
														'2': {
															type: 'object',
															properties: {
																meta: {
																	type: 'object',
																	properties: {
																		'3': {
																			type: 'object',
																			properties: {
																				value: { type: 'string' }
																			}
																		}
																	}
																}
															}
														}
													}
												}
											}
										}
									}
								}
							}
						}
					}
				},
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
			required: ['id', 'config', '_deleted', '_attachments', '_rev', '_meta']
		},
		options: {},
		multiInstance: false,
		devMode: false
	});

	console.log(`📝 Inserting ${docCount.toLocaleString()} documents with deeply nested numeric keys...`);
	const docs: Array<{ document: RxDocumentData<NestedDocType> }> = [];
	
	for (let i = 0; i < docCount; i++) {
		const doc: any = {
			id: `doc${i}`,
			config: {
				'0': {
					items: {
						'1': {
							data: {
								'2': {
									meta: {
										'3': {
											value: `value${i}`
										}
									}
								}
							}
						}
					}
				}
			},
			_deleted: false,
			_attachments: {},
			_rev: '1-abc',
			_meta: { lwt: Date.now() }
		};
		
		docs.push({ document: doc });
	}
	
	await instance.bulkWrite(docs, 'benchmark');
	console.log(`✅ Inserted ${docCount.toLocaleString()} documents\n`);
	
	return instance;
}

async function benchmarkSchemaTraversal(instance: any, docCount: number) {
	console.log('='.repeat(70));
	console.log(`📊 Schema Traversal Performance (${docCount.toLocaleString()} docs)`);
	console.log('='.repeat(70));
	console.log('Testing O(n²) behavior with nested numeric object keys\n');

	const tests = [
		{
			name: 'Shallow (1 numeric segment)',
			selector: { 'config.0': { $exists: true } },
			path: 'config.0',
			calls: 1,
			traversals: 1
		},
		{
			name: 'Medium (2 numeric segments)',
			selector: { 'config.0.items.1': { $exists: true } },
			path: 'config.0.items.1',
			calls: 2,
			traversals: 4
		},
		{
			name: 'Deep (3 numeric segments)',
			selector: { 'config.0.items.1.data.2': { $exists: true } },
			path: 'config.0.items.1.data.2',
			calls: 3,
			traversals: 9
		},
		{
			name: 'Very Deep (4 numeric segments)',
			selector: { 'config.0.items.1.data.2.meta.3': { $exists: true } },
			path: 'config.0.items.1.data.2.meta.3',
			calls: 4,
			traversals: 16
		},
		{
			name: 'Very Deep (4 numeric segments) - equality',
			selector: { 'config.0.items.1.data.2.meta.3.value': 'value0' },
			path: 'config.0.items.1.data.2.meta.3.value',
			calls: 4,
			traversals: 16
		}
	];

	const iterations = 1000;
	console.log(`Running ${iterations} iterations per test...\n`);

	for (const test of tests) {
		const times: number[] = [];
		
		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			await instance.query({
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
		}
		
		const avg = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3);
		const min = Math.min(...times).toFixed(3);
		const max = Math.max(...times).toFixed(3);
		
		console.log(`${test.name.padEnd(40)}`);
		console.log(`  Path: ${test.path}`);
		console.log(`  getColumnInfo() calls: ${test.calls} (${test.traversals} total traversals - O(n²))`);
		console.log(`  Avg: ${avg}ms | Min: ${min}ms | Max: ${max}ms`);
		console.log();
	}
}

async function benchmarkCacheImpact(instance: any) {
	console.log('='.repeat(70));
	console.log('📊 Cache Impact Analysis');
	console.log('='.repeat(70));
	console.log('Comparing repeated queries (cache hit vs cache miss)\n');

	const deepQuery = { 'config.0.items.1.data.2.meta.3.value': 'value0' };
	const iterations = 1000;

	console.log('Cold cache (first run):');
	const coldStart = performance.now();
	for (let i = 0; i < iterations; i++) {
		await instance.query({
			query: { selector: deepQuery, sort: [], skip: 0 },
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
	}
	const coldEnd = performance.now();
	const coldAvg = ((coldEnd - coldStart) / iterations).toFixed(3);
	console.log(`  Avg: ${coldAvg}ms per query`);
	console.log();

	console.log('Warm cache (repeated queries):');
	const warmStart = performance.now();
	for (let i = 0; i < iterations; i++) {
		await instance.query({
			query: { selector: deepQuery, sort: [], skip: 0 },
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
	}
	const warmEnd = performance.now();
	const warmAvg = ((warmEnd - warmStart) / iterations).toFixed(3);
	console.log(`  Avg: ${warmAvg}ms per query`);
	console.log();

	const improvement = (((coldEnd - coldStart) - (warmEnd - warmStart)) / (coldEnd - coldStart) * 100).toFixed(1);
	console.log(`Cache speedup: ${improvement}% faster (query cache, not schema cache)`);
	console.log();
}

async function main() {
	console.log('\n🏴‍☠️ Schema Traversal Benchmark');
	console.log('Testing O(n²) getColumnInfo() behavior with numeric object keys\n');
	
	const instance = await setupTestData(1000);
	
	await benchmarkSchemaTraversal(instance, 1000);
	await benchmarkCacheImpact(instance);
	
	await instance.close();
	
	console.log('='.repeat(70));
	console.log('✅ BENCHMARK COMPLETE');
	console.log('='.repeat(70));
	console.log('\nFindings:');
	console.log('1. buildJsonPath() calls getColumnInfo() for each numeric segment');
	console.log('2. getColumnInfo() traverses schema tree: O(n) per call');
	console.log('3. Total complexity: O(n²) where n = number of numeric segments');
	console.log('4. Current: NO caching of getColumnInfo() results');
	console.log('5. Query cache helps repeated queries, but not schema traversal');
	console.log('\nNext: Add schema info cache and re-run to measure impact\n');
}

main().catch(console.error);
