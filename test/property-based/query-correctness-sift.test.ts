import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fc from 'fast-check';
import { Query } from 'mingo';
import sift from 'sift';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

interface TestDocType {
	id: string;
	name: string;
	age: number;
	tags: string[];
	active: boolean;
	score: number;
	optional?: string;
	items: Array<{
		name: string;
		category: string;
		price: number;
		tags: string[];
	}>;
}

const mockDocs: RxDocumentData<TestDocType>[] = [
	{ id: '1', name: 'Alice', age: 30, tags: ['admin', 'user'], active: true, score: 95.5, optional: 'present', items: [{ name: 'item1', category: 'A', price: 100, tags: ['new'] }, { name: 'item2', category: 'B', price: 200, tags: ['sale'] }], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
	{ id: '2', name: 'Bob', age: 25, tags: ['user'], active: false, score: 80.0, items: [{ name: 'item3', category: 'A', price: 150, tags: [] }], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 2000 } },
	{ id: '3', name: 'Charlie', age: 35, tags: ['admin', 'moderator'], active: true, score: 88.3, optional: 'value', items: [{ name: 'item4', category: 'C', price: 300, tags: ['premium', 'new'] }], _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 3000 } },
	{ id: '4', name: 'David', age: 28, tags: ['user', 'moderator'], active: true, score: 92.1, items: [], _deleted: false, _attachments: {}, _rev: '1-d', _meta: { lwt: 4000 } },
	{ id: '5', name: 'Eve', age: 22, tags: [], active: false, score: 75.0, optional: undefined, items: [{ name: 'item5', category: 'B', price: 50, tags: ['clearance'] }], _deleted: false, _attachments: {}, _rev: '1-e', _meta: { lwt: 5000 } },
];

const MangoQueryArbitrary = () => {
	const fieldArb = fc.constantFrom('name', 'age', 'tags', 'active', 'score');
	const stringValueArb = fc.constantFrom('Alice', 'Bob', 'Charlie', 'David', 'Eve');
	const numberValueArb = fc.integer({ min: 20, max: 40 });
	const booleanValueArb = fc.boolean();
	
	const eqArb = fc.record({
		field: fieldArb,
		op: fc.constant('$eq'),
		value: fc.oneof(stringValueArb, numberValueArb, booleanValueArb)
	});
	
	const neArb = fc.record({
		field: fieldArb,
		op: fc.constant('$ne'),
		value: fc.oneof(stringValueArb, numberValueArb, booleanValueArb)
	});
	
	const gtArb = fc.record({
		field: fc.constantFrom('age', 'score'),
		op: fc.constant('$gt'),
		value: numberValueArb
	});
	
	const gteArb = fc.record({
		field: fc.constantFrom('age', 'score'),
		op: fc.constant('$gte'),
		value: numberValueArb
	});
	
	const ltArb = fc.record({
		field: fc.constantFrom('age', 'score'),
		op: fc.constant('$lt'),
		value: numberValueArb
	});
	
	const lteArb = fc.record({
		field: fc.constantFrom('age', 'score'),
		op: fc.constant('$lte'),
		value: numberValueArb
	});
	
	const inArb = fc.record({
		field: fieldArb,
		op: fc.constant('$in'),
		value: fc.array(fc.oneof(stringValueArb, numberValueArb), { minLength: 1, maxLength: 3 })
	});
	
	const ninArb = fc.record({
		field: fieldArb,
		op: fc.constant('$nin'),
		value: fc.array(fc.oneof(stringValueArb, numberValueArb), { minLength: 1, maxLength: 3 })
	});
	
	const elemMatchSimpleArb = fc.record({
		field: fc.constant('tags'),
		op: fc.constant('$elemMatch'),
		value: fc.oneof(
			fc.constantFrom('admin', 'user', 'mod').map(v => ({ $eq: v })),
			stringValueArb.map(v => ({ $ne: v }))
		)
	});
	
	const singleOpArb = fc.oneof(
		eqArb, neArb, gtArb, gteArb, ltArb, lteArb, inArb, ninArb, elemMatchSimpleArb
	);
	
	const toMangoQuery = (op: any) => {
		if (op.op === '$eq') {
			return { [op.field]: op.value };
		}
		if (op.op === '$elemMatch') {
			return { [op.field]: { $elemMatch: op.value } };
		}
		return { [op.field]: { [op.op]: op.value } };
	};
	
	const andArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$and: ops.map(toMangoQuery)
	}));
	
	const orArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$or: ops.map(toMangoQuery)
	}));
	
	const notArb = singleOpArb.map(op => ({
		[op.field]: { $not: { [op.op]: op.value } }
	}));
	
	const orWithNullArb = fc.array(
		fc.oneof(
			fc.constantFrom('present', 'value').map(v => ({ optional: v })),
			fc.constantFrom('present', 'value').map(v => ({ optional: { $ne: v } })),
			stringValueArb.map(v => ({ name: { $eq: v } }))
		),
		{ minLength: 2, maxLength: 3 }
	).map(arr => ({ $or: arr }));
	
	return fc.oneof(
		singleOpArb.map(toMangoQuery),
		andArb,
		orArb,
		notArb,
		orWithNullArb
	);
};

describe('Differential Testing: SQL vs Mingo vs Sift.js', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;
	
	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-sift',
			databaseName: 'testdb-sift',
			collectionName: 'users-sift',
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
					optional: { type: 'string' },
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
			'sift-test'
		);
	});
	
	afterEach(async () => {
		await instance.remove();
	});
	
	it('SQL matches BOTH Mingo AND Sift.js across 1000 queries', async () => {
		await fc.assert(
			fc.asyncProperty(MangoQueryArbitrary(), async (mangoQuery) => {
				const mingoQuery = new Query<TestDocType>(mangoQuery);
				const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
				const mingoIds = mingoResults.map(doc => doc.id).sort();
				
				const siftFilter = sift(mangoQuery);
				const siftResults = mockDocs.filter(siftFilter);
				const siftIds = siftResults.map(doc => doc.id).sort();
				
				const sqlResults = await instance.query({
					query: {
						selector: mangoQuery,
						sort: [{ id: 'asc' }],
						skip: 0
					},
					queryPlan: {
						index: ['id'],
						sortSatisfiedByIndex: false,
						selectorSatisfiedByIndex: false,
						startKeys: [],
						endKeys: [],
						inclusiveStart: true,
						inclusiveEnd: true
					}
				});
				const sqlIds = sqlResults.documents.map(doc => doc.id).sort();
				
				expect(sqlIds).toEqual(mingoIds);
				expect(sqlIds).toEqual(siftIds);
				expect(mingoIds).toEqual(siftIds);
			}),
			{ 
				numRuns: 1000,
				verbose: true,
				seed: 999
			}
		);
	}, 120000);
});
