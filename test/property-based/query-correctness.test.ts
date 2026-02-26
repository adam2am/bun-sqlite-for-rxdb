import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fc from 'fast-check';
import { Query } from 'mingo';
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
}

// Mock documents for testing
const mockDocs: RxDocumentData<TestDocType>[] = [
	{ id: '1', name: 'Alice', age: 30, tags: ['admin', 'user'], active: true, score: 95.5, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
	{ id: '2', name: 'Bob', age: 25, tags: ['user'], active: false, score: 80.0, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 2000 } },
	{ id: '3', name: 'Charlie', age: 35, tags: ['admin', 'moderator'], active: true, score: 88.3, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 3000 } },
	{ id: '4', name: 'David', age: 28, tags: ['user', 'moderator'], active: true, score: 92.1, _deleted: false, _attachments: {}, _rev: '1-d', _meta: { lwt: 4000 } },
	{ id: '5', name: 'Eve', age: 22, tags: [], active: false, score: 75.0, _deleted: false, _attachments: {}, _rev: '1-e', _meta: { lwt: 5000 } },
];

// Arbitrary generators for Mango query operators
const MangoQueryArbitrary = () => {
	const fieldArb = fc.constantFrom('name', 'age', 'tags', 'active', 'score');
	
	const stringValueArb = fc.constantFrom('Alice', 'Bob', 'Charlie', 'David', 'Eve', 'admin', 'user', 'moderator');
	const numberValueArb = fc.integer({ min: 20, max: 40 });
	const booleanValueArb = fc.boolean();
	
	// Simple comparison operators
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
	
	const existsArb = fc.record({
		field: fieldArb,
		op: fc.constant('$exists'),
		value: booleanValueArb
	});
	
	const sizeArb = fc.record({
		field: fc.constant('tags'),
		op: fc.constant('$size'),
		value: fc.integer({ min: 0, max: 3 })
	});
	
	const modArb = fc.record({
		field: fc.constantFrom('age', 'score'),
		op: fc.constant('$mod'),
		value: fc.tuple(fc.integer({ min: 2, max: 5 }), fc.integer({ min: 0, max: 4 }))
	});
	
	// Simple regex (SQL LIKE compatible)
	const regexArb = fc.record({
		field: fc.constantFrom('name'),
		op: fc.constant('$regex'),
		value: fc.constantFrom('Alice', 'Bob', 'lie', 'vid', '^A', 'e$')
	});
	
	const typeArb = fc.record({
		field: fieldArb,
		op: fc.constant('$type'),
		value: fc.constantFrom('string', 'number', 'boolean', 'array')
	});
	
	// $elemMatch with nested operators (THE BUG WE FIXED!)
	const elemMatchArb = fc.record({
		field: fc.constant('tags'),
		op: fc.constant('$elemMatch'),
		value: fc.oneof(
			// Nested $regex
			fc.record({ $regex: fc.constantFrom('admin', 'user', 'mod', '^a', 'r$') }),
			// Nested $type
			fc.record({ $type: fc.constantFrom('string', 'number') }),
			// Nested $eq
			fc.record({ $eq: stringValueArb }),
			// Nested $ne
			fc.record({ $ne: stringValueArb })
		)
	});
	
	// Single operator query
	const singleOpArb = fc.oneof(
		eqArb, neArb, gtArb, gteArb, ltArb, lteArb, 
		inArb, ninArb, existsArb, sizeArb, modArb, regexArb, typeArb,
		elemMatchArb  // ← ADDED: Test nested operators!
	);
	
	// Convert operator object to Mango query
	const toMangoQuery = (op: any) => {
		if (op.op === '$eq') {
			return { [op.field]: op.value };
		}
		if (op.op === '$elemMatch') {
			// Handle $elemMatch specially
			return { [op.field]: { $elemMatch: op.value } };
		}
		return { [op.field]: { [op.op]: op.value } };
	};
	
	// Logical operators
	const andArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$and: ops.map(toMangoQuery)
	}));
	
	const orArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$or: ops.map(toMangoQuery)
	}));
	
	const norArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$nor: ops.map(toMangoQuery)
	}));
	
	const notArb = singleOpArb.map(op => ({
		[op.field]: { $not: op.op === '$eq' ? op.value : { [op.op]: op.value } }
	}));
	
	// Combine all query types
	return fc.oneof(
		singleOpArb.map(toMangoQuery),
		andArb,
		orArb,
		norArb,
		notArb
	);
};

describe('Property-Based Testing: SQL vs Mingo Correctness', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;
	
	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
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
		
		// Insert mock documents
		await instance.bulkWrite(
			mockDocs.map(doc => ({ document: doc })),
			'property-based-test'
		);
	});
	
	afterEach(async () => {
		await instance.remove();
	});
	
	it('SQL results match Mingo results across 1000 random queries (COMPREHENSIVE)', async () => {
		await fc.assert(
			fc.asyncProperty(MangoQueryArbitrary(), async (mangoQuery) => {
				// Execute with Mingo (reference implementation)
				const mingoQuery = new Query<TestDocType>(mangoQuery);
				const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
				const mingoIds = mingoResults.map(doc => doc.id).sort();
				
				// Execute with our SQL builder
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
				} as any);
				const sqlIds = sqlResults.documents.map(doc => doc.id).sort();
				
				// Compare results
				expect(sqlIds).toEqual(mingoIds);
			}),
			{ 
				numRuns: 1000,  // ← INCREASED: 10x more coverage
				verbose: true,
				seed: 42 // Reproducible results
			}
		);
	}, 120000); // 2 minute timeout for 1000 runs
	
	it('handles edge cases: empty results', async () => {
		const query = { age: { $gt: 100 } }; // No matches
		
		const mingoQuery = new Query<TestDocType>(query);
		const mingoResults = mingoQuery.find(mockDocs).all();
		
		const sqlResults = await instance.query({
			query: {
				selector: query,
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
		} as any);
		
		expect(sqlResults.documents.length).toBe(0);
		expect(mingoResults.length).toBe(0);
	});
	
	it('handles edge cases: all documents match', async () => {
		const query = { _deleted: false }; // All match
		
		const mingoQuery = new Query<TestDocType>(query);
		const mingoResults = mingoQuery.find(mockDocs).all();
		
		const sqlResults = await instance.query({
			query: {
				selector: query,
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
		} as any);
		
		expect(sqlResults.documents.length).toBe(5);
		expect(mingoResults.length).toBe(5);
	});
});
