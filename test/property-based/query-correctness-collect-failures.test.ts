import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fc from 'fast-check';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxStorage, RxStorageInstance, MangoQuerySelector, RxDocumentData } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';
import { MangoQueryArbitrary } from './arbitraries';
import { TestDocType, mockDocs } from './fixtures/documents';
import { hasKnownMingoQuirk } from './engine/mingo-quirks';
import { runSQLQuery, runMingoQuery, compareResults } from './engine/runner';
import { fingerprintQuery } from './utils/query-fingerprint';

describe('Property-Based Testing: Collect All Failures', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite({ strict: true });
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-pbt-collect',
			databaseName: 'testdb-pbt-collect',
			collectionName: 'users-pbt-collect',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					age: { type: 'number' },
					tags: { type: 'array', items: { type: 'string' } },
					active: { type: 'boolean' },
					score: { type: 'number' },
					scores: { type: 'array', items: { type: 'number' } },
					optional: { type: 'string' },
					metadata: { type: 'object' },
					unknownField: {},
					'first name': { type: 'string' },
					'user-name': { type: 'string' },
					role: { type: 'string' },
					matrix: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
					data: {},
					count: {},
					strVal: { type: 'string' },
					items: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								category: { type: 'string' },
								price: { type: 'number' },
								tags: { type: 'array', items: { type: 'string' } }
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
				required: ['id', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance.bulkWrite(
			mockDocs.map(doc => ({ document: doc })),
			'property-based-test-collect'
		);
	});

	afterEach(async () => {
		await instance.remove();
	});

	it('Collect all failures grouped by pattern', async () => {
		interface FailurePattern {
			examples: Array<{ query: unknown; sqlIds: string[]; mingoIds: string[] }>;
			failureCount: number;
			totalRuns: number;
			failureRate: number;
		}
		
		const failures = new Map<string, FailurePattern>();
		const quirkStats = new Map<string, number>();
		const unexpectedErrors = new Map<string, number>();
		let totalQueries = 0;
		let quirksDetected = 0;

		console.log(`\n🚀 Starting test with numRuns: 1000, seed: 42\n`);

		const result = await fc.check(
			fc.asyncProperty(MangoQueryArbitrary(), async (mangoQuery) => {
				totalQueries++;
				
				if (totalQueries % 100 === 0) {
					console.log(`📊 Progress: ${totalQueries} queries processed...`);
				}

				if (hasKnownMingoQuirk(mangoQuery)) {
					quirksDetected++;
					const pattern = fingerprintQuery(mangoQuery);
					quirkStats.set(pattern, (quirkStats.get(pattern) || 0) + 1);
					return true;
				}

				try {
					const mingoResult = runMingoQuery(mockDocs, mangoQuery);
					const sqlResult = await runSQLQuery(instance, mangoQuery);
					const comparison = compareResults(sqlResult, mingoResult);

					const pattern = fingerprintQuery(mangoQuery);
					
					if (!failures.has(pattern)) {
						failures.set(pattern, {
							examples: [],
							failureCount: 0,
							totalRuns: 0,
							failureRate: 0
						});
					}
					
					const patternData = failures.get(pattern)!;
					patternData.totalRuns++;

					if (!comparison.match) {
						patternData.failureCount++;
						if (patternData.examples.length < 5) {
							patternData.examples.push({
								query: mangoQuery,
								sqlIds: comparison.diff!.sql,
								mingoIds: comparison.diff!.mingo
							});
						}
					}
					
					patternData.failureRate = patternData.failureCount / patternData.totalRuns;

					return true;
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					unexpectedErrors.set(errorMsg, (unexpectedErrors.get(errorMsg) || 0) + 1);
					console.error(`❌ Unexpected error on query ${totalQueries}:`, errorMsg);
					return true;
				}
			}),
			{
				numRuns: 1000,
				verbose: false,
				seed: 42
			}
		);

		console.log(`\n🔍 Fast-check result:`, result);

		const failingPatterns = Array.from(failures.entries())
			.filter(([_, data]) => data.failureCount > 0)
			.sort((a, b) => b[1].failureRate - a[1].failureRate);

		console.log(`\n📊 Test Statistics:`);
		console.log(`Total queries generated: ${totalQueries}`);
		console.log(`Quirks detected (skipped): ${quirksDetected}`);
		console.log(`Queries tested against Mingo: ${totalQueries - quirksDetected}`);
		console.log(`Unique patterns tested: ${failures.size}`);
		console.log(`Failing patterns: ${failingPatterns.length}`);
		console.log(`Unexpected errors: ${unexpectedErrors.size}\n`);

		if (failingPatterns.length > 0) {
			console.log(`❌ Failure patterns found (${failingPatterns.length} unique):\n`);
			failingPatterns.forEach(([pattern, data]) => {
				const category = 
					data.failureRate >= 0.95 ? 'CONSISTENT (P1)' :
					data.failureRate >= 0.05 ? 'FLAKY (P2)' :
					'RARE (P3)';
				
				console.log(`Pattern: ${pattern}`);
				console.log(`Category: ${category}`);
				console.log(`Failure Rate: ${(data.failureRate * 100).toFixed(1)}% (${data.failureCount}/${data.totalRuns})`);
				console.log(`Example: ${JSON.stringify(data.examples[0].query)}`);
				console.log(`  SQL:   [${data.examples[0].sqlIds.join(', ')}]`);
				console.log(`  Mingo: [${data.examples[0].mingoIds.join(', ')}]\n`);
			});
		}

		if (unexpectedErrors.size > 0) {
			console.log(`⚠️ Unexpected errors encountered (${unexpectedErrors.size} types):\n`);
			unexpectedErrors.forEach((count, errorMsg) => {
				console.log(`  ${count}x: ${errorMsg}`);
			});
			console.log();
		}

		console.log(`✅ Test complete. Review patterns above.`);
		expect(unexpectedErrors.size).toBe(0);
	}, 60000);
});
