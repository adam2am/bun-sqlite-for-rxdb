import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fc from 'fast-check';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxStorage, RxStorageInstance, MangoQuerySelector, RxDocumentData } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';
import { MangoQueryArbitrary } from './arbitraries';
import { TestDocType, mockDocs } from './fixtures/documents';
import { hasKnownMingoQuirk } from './engine/mingo-quirks';
import { runSQLQuery, runMingoQuery, compareResults } from './engine/runner';

describe('Property-Based Testing: SQL vs Mingo Correctness (Refactored)', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite({ strict: true });
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-pbt-refactored',
			databaseName: 'testdb-pbt-refactored',
			collectionName: 'users-pbt-refactored',
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
			'property-based-test-refactored'
		);
	});

	afterEach(async () => {
		await instance.remove();
	});

	it('SQL results match Mingo (modular arbitraries)', async () => {
		await fc.assert(
			fc.asyncProperty(MangoQueryArbitrary(), async (mangoQuery) => {
				if (hasKnownMingoQuirk(mangoQuery)) {
					const sqlResult = await runSQLQuery(instance, mangoQuery);
					expect(sqlResult.ids).toBeDefined();
					expect(Array.isArray(sqlResult.ids)).toBe(true);
					return;
				}

				const mingoResult = runMingoQuery(mockDocs, mangoQuery);
				const sqlResult = await runSQLQuery(instance, mangoQuery);
				const comparison = compareResults(sqlResult, mingoResult);

				expect(comparison.match).toBe(true);
			}),
			{
				numRuns: 100,
				verbose: true,
				seed: 42
			}
		);
	}, 60000);
});
