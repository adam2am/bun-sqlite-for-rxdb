import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fc from 'fast-check';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';
import { MangoASTGenerator } from '$tests/property-based/generators/ast.gen';
import { TestDocumentArbitrary } from '$tests/property-based/generators/document.gen';
import { hasKnownMingoQuirk, getQuirkDetails } from '$tests/property-based/engine/mingo-quirks';
import { runSQLQuery, runMingoQuery, compareResults } from '$tests/property-based/engine/runner';
import { fingerprintQuery } from '$tests/property-based/utils/query-fingerprint';

describe('Property-Based: Query Correctness (fc.letrec)', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<any, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite({ strict: true });
		instance = await storage.createStorageInstance({
			databaseInstanceToken: 'test-token-pbt',
			databaseName: 'testdb-pbt',
			collectionName: 'users-pbt',
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
	});

	afterEach(async () => {
		await instance.remove();
	});

	it('SQL vs Mingo with pattern grouping', async () => {
		const SKIP_QUIRKS = true; // Linus-style toggle: set false to test quirk handling
		interface FailurePattern {
			examples: Array<{ query: unknown; sqlIds: string[]; mingoIds: string[]; documents: unknown[] }>;
			failureCount: number;
			totalRuns: number;
			failureRate: number;
		}
		
		const failures = new Map<string, FailurePattern>();
		const detailedFailures: Array<{ query: unknown; documents: unknown[]; sqlIds: string[]; mingoIds: string[]; pattern: string }> = [];
		const quirkStats = new Map<string, number>();
		const unexpectedErrors = new Map<string, number>();
		let totalQueries = 0;
		let quirksDetected = 0;

		console.log(`\n🚀 Starting test with numRuns: 1000, seed: 42\n`);

		const result = await fc.check(
			fc.asyncProperty(
				MangoASTGenerator.query,
				fc.array(TestDocumentArbitrary, { minLength: 10, maxLength: 20 }),
				async (mangoQuery, documents) => {
					totalQueries++;
					
					if (totalQueries % 100 === 0) {
						console.log(`📊 Progress: ${totalQueries} queries processed...`);
					}

					if (SKIP_QUIRKS && hasKnownMingoQuirk(mangoQuery)) {
						quirksDetected++;
						const pattern = fingerprintQuery(mangoQuery);
						quirkStats.set(pattern, (quirkStats.get(pattern) || 0) + 1);
						return true;
					}

				try {
					await instance.bulkWrite(
						documents.map(doc => ({ document: doc })),
						'pbt-test'
					);

					const mingoResult = runMingoQuery(documents, mangoQuery);
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
								mingoIds: comparison.diff!.mingo,
								documents
							});
						}
						
						if (detailedFailures.length < 50) {
							detailedFailures.push({
								query: mangoQuery,
								documents,
								sqlIds: comparison.diff!.sql,
								mingoIds: comparison.diff!.mingo,
								pattern
							});
						}
					}
					
					patternData.failureRate = patternData.failureCount / patternData.totalRuns;

					return true;
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : String(error);
					unexpectedErrors.set(errorMsg, (unexpectedErrors.get(errorMsg) || 0) + 1);
					console.error(`❌ Unexpected error on query ${totalQueries}:`, errorMsg);
					if (error instanceof Error && error.stack) {
						console.error(`Stack trace:\n${error.stack}`);
					}
					console.error(`Query that caused error:`, JSON.stringify(mangoQuery, null, 2));
					return true;
				} finally {
					const tableName = `${instance.collectionName}_v${instance.schema.version}`;
					await instance.internals.db.run(`DELETE FROM "${tableName}"`);
				}
				}
			),
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
				console.log(`  SQL:   [${data.examples[0].sqlIds.length}]`);
				console.log(`  Mingo: [${data.examples[0].mingoIds.length}]\n`);
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
		
		if (failures.size > 0) {
			const fs = await import('fs');
			const path = await import('path');
			const outputDir = 'test/property-based/suites/isolated/failures';
			
			// Clear old failures before writing new ones
			if (fs.existsSync(outputDir)) {
				fs.rmSync(outputDir, { recursive: true });
			}
			fs.mkdirSync(outputDir, { recursive: true });
			
			let fileCount = 0;
			failures.forEach((data, pattern) => {
				if (data.failureCount > 0) {
					fileCount++;
					const sanitized = pattern.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').substring(0, 50);
					const filename = path.join(outputDir, `${fileCount.toString().padStart(2, '0')}-${sanitized}.json`);
					
					const output = {
						pattern,
						failureRate: data.failureRate,
						failureCount: data.failureCount,
						totalRuns: data.totalRuns,
						examples: data.examples.slice(0, 3)
					};
					
					fs.writeFileSync(filename, JSON.stringify(output, null, 2));
				}
			});
			
			console.log(`\n📝 Wrote ${fileCount} pattern files to: ${outputDir}/`);
		}
		
		expect(unexpectedErrors.size).toBe(0);
	}, 120000);
});
