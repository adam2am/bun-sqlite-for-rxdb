import { describe, it, expect } from 'bun:test';
import { buildWhereClause } from '$app/query/builder';
import { getRxStorageBunSQLite } from '$app/index';
import type { RxJsonSchema } from 'rxdb';

const testSchema: RxJsonSchema<any> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		age: { type: 'number' },
		score: { type: 'number' }
	},
	required: ['id']
};

describe('DEBUG: $or + $mod Bug Investigation', () => {
	it('should track full pipeline for {"$or":[{"age":{"$lte":20}},{"score":{"$mod":[2,0]}}]}', async () => {
		console.log('\n=== PIPELINE TRACKING START ===\n');
		
		const query = { $or: [{ age: { $lte: 20 } }, { score: { $mod: [2, 0] } }] };
		console.log('1. INPUT QUERY:', JSON.stringify(query, null, 2));
		
		const whereClause = buildWhereClause(query, testSchema, 'test');
		console.log('\n2. GENERATED SQL:');
		console.log('   SQL:', whereClause?.sql);
		console.log('   ARGS:', whereClause?.args);
		
	const storage = getRxStorageBunSQLite({ filename: ':memory:' });
	const instance = await storage.createStorageInstance({
		databaseInstanceToken: 'test-token',
		databaseName: 'test',
		collectionName: 'test',
		schema: testSchema,
		options: {},
		multiInstance: false,
		devMode: false
	});
		
		const testDocs = [
			{ id: '1', age: 15, score: 10, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: 1 } },
			{ id: '2', age: 25, score: 20, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: 1 } },
			{ id: '3', age: 30, score: 21, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: 1 } },
			{ id: '4', age: 35, score: 22, _deleted: false, _attachments: {}, _rev: '1', _meta: { lwt: 1 } }
		];
		
		console.log('\n3. TEST DATA:');
		testDocs.forEach(doc => {
			const ageLte20 = doc.age <= 20;
			const scoreMod2 = doc.score % 2 === 0;
			const shouldMatch = ageLte20 || scoreMod2;
			console.log(`   id:${doc.id} age:${doc.age} score:${doc.score} | age<=20:${ageLte20} score%2=0:${scoreMod2} | SHOULD_MATCH:${shouldMatch}`);
		});
		
		await instance.bulkWrite(testDocs.map(doc => ({ document: doc })), 'test');
		
		const results = await instance.query({
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
		});
		
		const resultIds = results.documents.map(doc => doc.id).sort();
		console.log('\n4. ACTUAL RESULTS:', resultIds);
		
		console.log('\n5. EXPECTED RESULTS:');
		console.log('   Based on logic: id:1 (age<=20✓ OR score%2=0✓) = MATCH');
		console.log('                   id:2 (age<=20✗ OR score%2=0✓) = MATCH');
		console.log('                   id:3 (age<=20✗ OR score%2=1✗) = NO MATCH');
		console.log('                   id:4 (age<=20✗ OR score%2=0✓) = MATCH');
		console.log('   Expected IDs: ["1", "2", "4"]');
		
		console.log('\n6. COMPARISON:');
		console.log('   Expected: ["1", "2", "4"]');
		console.log('   Received:', resultIds);
		console.log('   Match:', JSON.stringify(resultIds) === JSON.stringify(['1', '2', '4']));
		
		console.log('\n=== PIPELINE TRACKING END ===\n');
		
		expect(resultIds).toEqual(['1', '2', '4']);
		
		await instance.remove();
	});
});
