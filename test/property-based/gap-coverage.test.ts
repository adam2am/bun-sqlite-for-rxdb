import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fc from 'fast-check';
import { Query } from 'mingo';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxStorage, RxStorageInstance, RxJsonSchema } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

// ============================================================================
// SCHEMA: Hostile Data Fields
// ============================================================================

interface GapDocType {
	id: string;
	strVal?: string;
	numVal?: number;
	boolVal?: boolean;
	arrVal?: any[];
	objVal?: Record<string, any>;
	mixedVal?: any;
	"dot.field"?: string;
	"dollar$field"?: string;
	_deleted: boolean;
	_attachments: Record<string, unknown>;
	_rev: string;
	_meta: { lwt: number };
}

const gapSchema: RxJsonSchema<RxDocumentData<GapDocType>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 100 },
		strVal: { type: 'string' },
		numVal: { type: 'number' },
		boolVal: { type: 'boolean' },
		arrVal: { type: 'array' },
		objVal: { type: 'object' },
		mixedVal: {},
		"dot.field": { type: 'string' },
		"dollar$field": { type: 'string' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

function isKnownMingoDivergence(query: any): boolean {
	const str = JSON.stringify(query);
	if (str.includes('$in') && str.includes('$regex')) return true;
	if (str.includes('$nin') && str.includes('$regex')) return true;
	return false;
}

// ============================================================================
// STATIC TESTS: System Limits & Security
// ============================================================================

describe('GAP COVERAGE: System Limits & Security', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<GapDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance({
			databaseInstanceToken: 'gap-test-' + Math.random(),
			databaseName: ':memory:',
			collectionName: 'gaps',
			schema: gapSchema,
			options: {},
			multiInstance: false,
			devMode: false
		});
	});

	afterEach(async () => {
		await instance.remove();
	});

	it('GAP 28: Handles SQL variable limit (2000+ IDs) in findDocumentsById', async () => {
		const count = 2000;
		const ids = Array.from({ length: count }, (_, i) => `id-${i}`);
		
		await instance.bulkWrite([
			{ document: { id: 'id-0', _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } }
		], 'test');

		const results = await instance.findDocumentsById(ids, false);
		expect(results.length).toBe(1);
	});

	it('GAP 30: Handles deep recursion without stack overflow', async () => {
		const depth = 500;
		let query: any = { numVal: 1 };
		for (let i = 0; i < depth; i++) {
			query = { $and: [query] };
		}

		await instance.bulkWrite([
			{ document: { id: '1', numVal: 1, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } }
		], 'test');

		try {
			const results = await instance.query({
				query: { selector: query, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
			});
			expect(results.documents.length).toBe(1);
		} catch (e: any) {
			if (e.message.includes('stack')) throw e;
		}
	});

	it('GAP 24: Handles null bytes in string values safely', async () => {
		const nullString = "value\u0000with\u0000null";
		await instance.bulkWrite([
			{ document: { id: '1', strVal: nullString, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } }
		], 'test');

		const resFull = await instance.query({
			query: { selector: { strVal: nullString }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
		});
		expect(resFull.documents.length).toBe(1);

		const resTrunc = await instance.query({
			query: { selector: { strVal: "value" }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
		});
		expect(resTrunc.documents.length).toBe(0);
	});

	it('GAP 38: Escapes SQL wildcards (%) in regex literals', async () => {
		await instance.bulkWrite([
			{ document: { id: '1', strVal: "100", _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } },
			{ document: { id: '2', strVal: "100%", _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1 } } }
		], 'test');

		const result = await instance.query({
			query: { selector: { strVal: { $regex: "^100%$" } }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
		});

		const ids = result.documents.map(d => d.id);
		expect(ids).toContain('2');
		expect(ids).not.toContain('1');
	});

	it('GAP 37: $size on non-array does not crash', async () => {
		await instance.bulkWrite([
			{ document: { id: '1', mixedVal: "i_am_a_string", _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } }
		], 'test');

		const result = await instance.query({
			query: { selector: { mixedVal: { $size: 13 } }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
		});
		
		expect(result.documents.length).toBe(0);
	});
});

// ============================================================================
// PROPERTY-BASED: Hostile Data Fuzzing
// ============================================================================

describe('GAP COVERAGE: Hostile Data Fuzzing', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<GapDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance({
			databaseInstanceToken: 'fuzz-' + Math.random(),
			databaseName: ':memory:',
			collectionName: 'fuzz',
			schema: gapSchema,
			options: {},
			multiInstance: false,
			devMode: false
		});
	});

	afterEach(async () => {
		await instance.remove();
	});

	const hostileString = fc.oneof(
		fc.string(),
		fc.constant("null"),
		fc.constant("undefined"),
		fc.constant("true"),
		fc.constant("100%"),
		fc.constant("_"),
		fc.constant("'"),
		fc.constant('"'),
		fc.constant("\\"),
		fc.constant("a\u0000b")
	);

	const hostileNumber = fc.oneof(
		fc.double({ noNaN: true, noDefaultInfinity: true }),
		fc.integer(),
		fc.constant(0)
	);

	const validDoc = fc.record({
		id: fc.uuid(),
		strVal: hostileString,
		numVal: hostileNumber,
		boolVal: fc.boolean(),
		arrVal: fc.array(fc.oneof(hostileString, fc.integer(), fc.boolean()), { maxLength: 5 }),
		mixedVal: fc.oneof(hostileString, fc.integer(), fc.array(fc.integer())),
		_deleted: fc.constant(false),
		_attachments: fc.constant({}),
		_rev: fc.constant('1-1'),
		_meta: fc.constant({ lwt: Date.now() })
	});

	it('Matches Mingo behavior for hostile inputs (Vectors A-F)', async () => {
		let iterationCount = 0;
		await fc.assert(
			fc.asyncProperty(fc.array(validDoc, { minLength: 1, maxLength: 20 }), async (docs) => {
				if (iterationCount > 0) {
					await instance.remove();
					instance = await storage.createStorageInstance({
						databaseInstanceToken: 'fuzz-' + Math.random(),
						databaseName: ':memory:',
						collectionName: 'fuzz',
						schema: gapSchema,
						options: {},
						multiInstance: false,
						devMode: false
					});
				}
				iterationCount++;
				
				await instance.bulkWrite(docs.map(d => ({ document: d })), 'fuzz');

				const queries = [
					{ strVal: null },
					{ mixedVal: { $exists: true } },
					{ strVal: { $regex: '100%' } },
					{ numVal: { $type: 'number' } },
					{ mixedVal: { $size: 1 } },
					{ numVal: { $gt: 0 } },
					{ numVal: { $gt: "0" } }
				];

				for (const query of queries) {
					const mingoQuery = new Query(query);
					const mingoExpectedIds = docs.filter(d => mingoQuery.test(d as any)).map(d => d.id).sort();

					const result = await instance.query({
						query: { selector: query, sort: [{ id: 'asc' }], skip: 0 },
						queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
					});
					const actualIds = result.documents.map(d => d.id).sort();

					if (!isKnownMingoDivergence(query)) {
						if (actualIds.length !== mingoExpectedIds.length || !actualIds.every((id, i) => id === mingoExpectedIds[i])) {
							console.log('\n🔍 DIVERGENCE FOUND:');
							console.log('Query:', JSON.stringify(query));
							console.log('Test docs:', JSON.stringify(docs, null, 2));
							console.log('Mingo expected:', mingoExpectedIds);
							console.log('Our result:', actualIds);
							console.log('Divergence:', {
								extra: actualIds.filter(id => !mingoExpectedIds.includes(id)),
								missing: mingoExpectedIds.filter(id => !actualIds.includes(id))
							});
						}
						expect(actualIds).toEqual(mingoExpectedIds);
					}
				}
			}),
			{ numRuns: 50, timeout: 30000 }
		);
	});
});

// ============================================================================
// CONFIRMED GAPS: From debug-step-by-step.ts & debug-gaps-advanced.ts
// ============================================================================

describe('GAP COVERAGE: Confirmed Gaps (Regression Tests)', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<GapDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance({
			databaseInstanceToken: 'confirmed-' + Math.random(),
			databaseName: ':memory:',
			collectionName: 'confirmed',
			schema: gapSchema,
			options: {},
			multiInstance: false,
			devMode: false
		});
	});

	afterEach(async () => {
		await instance.remove();
	});

	it('GAP 2: Unsupported operators treated as $eq', async () => {
		await instance.bulkWrite([
			{ document: { id: '1', numVal: 1, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } }
		], 'test');

		const result = await instance.query({
			query: { selector: { numVal: { $bitsAllSet: 1 } } as any, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
		});

		expect(result.documents.length).toBe(0);
	});

	it('GAP 8: Missing BSON type 9 (date)', async () => {
		await instance.bulkWrite([
			{ document: { id: '1', strVal: '2025-01-01T00:00:00.000Z', _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } }
		], 'test');

		const result = await instance.query({
			query: { selector: { strVal: { $type: 9 } } as any, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
		});

		expect(result.documents.length).toBe(1);
	});

	it('GAP 9: Int vs double squashing', async () => {
		await instance.bulkWrite([
			{ document: { id: '1', numVal: 4, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } },
			{ document: { id: '2', numVal: 4.5, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1 } } }
		], 'test');

		const resultInt = await instance.query({
			query: { selector: { numVal: { $type: 'int' } } as any, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
		});

		expect(resultInt.documents.map(d => d.id)).toEqual(['1']);
	});

	it('GAP 11: $all 2D array flattening', async () => {
		await instance.bulkWrite([
			{ document: { id: '1', arrVal: [[1], [2]], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } },
			{ document: { id: '2', arrVal: [1, 2], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1 } } }
		], 'test');

		const result = await instance.query({
			query: { selector: { arrVal: { $all: [1, 2] } } as any, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
		});

		expect(result.documents.map(d => d.id)).toEqual(['2']);
	});

	it('GAP 25: Multiline regex anchors', async () => {
		await instance.bulkWrite([
			{ document: { id: '1', strVal: "Line1\nLine2", _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } }
		], 'test');

		const result = await instance.query({
			query: { selector: { strVal: { $regex: '^Line2', $options: 'm' } } as any, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
		});

		expect(result.documents.length).toBe(1);
	});

	it('GAP 51: Null query matching non-null values', async () => {
		await instance.bulkWrite([
			{ document: { id: '1', strVal: "'", _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1 } } },
			{ document: { id: '2', strVal: null as any, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 1 } } }
		], 'test');

		const result = await instance.query({
			query: { selector: { strVal: null } as any, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], selectorSatisfiedByIndex: false } as any
		});

		expect(result.documents.map(d => d.id)).toEqual(['2']);
	});
});
