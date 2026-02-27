import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fc from 'fast-check';
import { Query } from 'mingo';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxStorage, RxStorageInstance, MangoQuerySelector } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

interface TestDocType {
	id: string;
	name: string;
	email: string;
	description: string;
}

const mockDocs: RxDocumentData<TestDocType>[] = [
	{ id: '1', name: 'Alice', email: 'alice@example.com', description: 'Admin user with full access', _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
	{ id: '2', name: 'Bob', email: 'bob123@test.org', description: 'Regular user account', _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 2000 } },
	{ id: '3', name: 'Charlie', email: 'charlie.brown@company.net', description: 'Moderator with limited access', _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 3000 } },
	{ id: '4', name: 'David', email: 'david_smith@mail.com', description: 'Guest user temporary', _deleted: false, _attachments: {}, _rev: '1-d', _meta: { lwt: 4000 } },
	{ id: '5', name: 'Eve', email: 'eve.jones@domain.io', description: 'Power user advanced features', _deleted: false, _attachments: {}, _rev: '1-e', _meta: { lwt: 5000 } },
];

const ComplexRegexArbitrary = (): fc.Arbitrary<MangoQuerySelector<RxDocumentData<TestDocType>>> => {
	const complexRegexArb = fc.oneof(
		fc.constantFrom('(Alice|Bob)', '(Charlie|David|Eve)', 'A.*e', 'B[ob]+', '[A-Z][a-z]+').map(p => ({ name: { $regex: p } })),
		fc.constantFrom('.*@example\\.com', '.*@(test|mail)\\..*', '[a-z]+@[a-z]+\\.[a-z]{2,3}', '.*\\d+.*', '^[a-z]+@.*').map(p => ({ email: { $regex: p } })),
		fc.constantFrom('(Admin|Moderator)', '.*user.*', '^(Regular|Guest).*', '.*(access|features)$', '\\w+\\s+\\w+').map(p => ({ description: { $regex: p } })),
		fc.constantFrom('A+', 'B*', 'C?', 'D{1,3}', '[aeiou]{2,}').map(p => ({ name: { $regex: p, $options: 'i' } }))
	);
	
	const simpleOpArb = fc.oneof(
		fc.constantFrom('1', '2', '3', '4', '5').map(v => ({ id: { $gt: v } })),
		fc.constantFrom('1', '2', '3', '4', '5').map(v => ({ id: { $ne: v } })),
		fc.constantFrom('Alice', 'Bob', 'Charlie').map(v => ({ name: { $eq: v } }))
	);
	
	return fc.oneof(
		complexRegexArb,
		fc.array(
			fc.oneof(
				fc.constantFrom('(A|B)', '[A-Z]+').map(p => ({ name: { $regex: p } })),
				fc.constantFrom('.*@.*\\.com', '.*@test.*').map(p => ({ email: { $regex: p } }))
			),
			{ minLength: 2, maxLength: 2 }
		).map(arr => ({ $or: arr })),
		fc.tuple(complexRegexArb, simpleOpArb).map(([regex, simple]) => ({
			$and: [regex, simple]
		})),
		fc.tuple(
			fc.constantFrom('(Alice|Bob)', '[A-Z]+').map(p => ({ name: { $regex: p } })),
			fc.constantFrom('1', '3', '5').map(v => ({ id: { $gt: v } }))
		).map(([regex, comp]) => ({ ...regex, ...comp }))
	) as fc.Arbitrary<MangoQuerySelector<RxDocumentData<TestDocType>>>;
};

describe('Complex Regex Patterns: In-Memory Filtering (Manual Run Only)', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;
	
	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-regex',
			databaseName: 'testdb-regex',
			collectionName: 'users-regex',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					email: { type: 'string' },
					description: { type: 'string' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: { 
						type: 'object',
						properties: { lwt: { type: 'number' } }
					}
				},
				required: ['id', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});
		
		await instance.bulkWrite(mockDocs.map(doc => ({ document: doc })), 'regex-test');
	});
	
	afterEach(async () => {
		await instance.remove();
	});
	
	it('complex regex patterns match Mingo results (1000 queries)', async () => {
		await fc.assert(
			fc.asyncProperty(ComplexRegexArbitrary(), async (mangoQuery) => {
				const mingoQuery = new Query<TestDocType>(mangoQuery);
				const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
				const mingoIds = mingoResults.map(doc => doc.id).sort();
				
				const sqlResults = await instance.query({
					query: { selector: mangoQuery, sort: [{ id: 'asc' }], skip: 0 },
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
			}),
			{ numRuns: 1000, verbose: true, seed: 999 }
		);
	}, 120000);
	
	it('alternation patterns: (A|B)', async () => {
		const query = { name: { $regex: '(Alice|Bob)' } };
		const mingoQuery = new Query<TestDocType>(query);
		const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
		const sqlResults = await instance.query({
			query: { selector: query, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false, startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true }
		});
				expect(sqlResults.documents.map(d => d.id).sort()).toEqual(mingoResults.map(d => d.id).sort());
	});
	
	it('quantifiers: A+, B*, C?', async () => {
		const query = { description: { $regex: '\\w+\\s+\\w+' } };
		const mingoQuery = new Query<TestDocType>(query);
		const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
		const sqlResults = await instance.query({
			query: { selector: query, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false, startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true }
		});
				expect(sqlResults.documents.map(d => d.id).sort()).toEqual(mingoResults.map(d => d.id).sort());
	});
	
	it('character classes: [A-Z], [0-9]', async () => {
		const query = { email: { $regex: '[a-z]+@[a-z]+\\.[a-z]{2,3}' } };
		const mingoQuery = new Query<TestDocType>(query);
		const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
		const sqlResults = await instance.query({
			query: { selector: query, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false, startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true }
		});
				expect(sqlResults.documents.map(d => d.id).sort()).toEqual(mingoResults.map(d => d.id).sort());
	});
	
	it('case insensitive complex patterns', async () => {
		const query = { name: { $regex: '[aeiou]{2,}', $options: 'i' } };
		const mingoQuery = new Query<TestDocType>(query);
		const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
		const sqlResults = await instance.query({
			query: { selector: query, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false, startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true }
		});
		expect(sqlResults.documents.map(d => d.id).sort()).toEqual(mingoResults.map(d => d.id).sort());
	});
	
	it('complex regex mixed with $and', async () => {
		const query = { $and: [{ name: { $regex: '(Alice|Bob)' } }, { id: { $gt: '1' } }] };
		const mingoQuery = new Query<TestDocType>(query as any);
		const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
		const sqlResults = await instance.query({
			query: { selector: query, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false, startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true }
		});
		expect(sqlResults.documents.map(d => d.id).sort()).toEqual(mingoResults.map(d => d.id).sort());
	});
	
	it('complex regex with comparison operators', async () => {
		const query = { name: { $regex: '[A-Z]+' }, id: { $ne: '3' } };
		const mingoQuery = new Query<TestDocType>(query);
		const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
		const sqlResults = await instance.query({
			query: { selector: query, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: ['id'], sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false, startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true }
		});
		expect(sqlResults.documents.map(d => d.id).sort()).toEqual(mingoResults.map(d => d.id).sort());
	});
});
