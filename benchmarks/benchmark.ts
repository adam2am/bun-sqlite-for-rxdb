import { getRxStorageBunSQLite } from '../src/storage';
import type { RxDocumentData } from 'rxdb';

interface BenchmarkDocType {
	id: string;
	name: string;
	age: number;
	status: string;
}

async function benchmark() {
	console.log('🏴‍☠️ Benchmarking Phase 3 (Advanced Query Operators)...\n');

	const storage = getRxStorageBunSQLite();
	const instance = await storage.createStorageInstance<BenchmarkDocType>({
		databaseInstanceToken: 'benchmark-token',
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

	console.log('📝 Inserting 10,000 documents...');
	const docs: Array<{ document: RxDocumentData<BenchmarkDocType> }> = [];
	for (let i = 0; i < 10000; i++) {
		docs.push({
			document: {
				id: `user${i}`,
				name: `User ${i}`,
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
	console.log('✅ Inserted 10,000 documents\n');

	console.log('⏱️  Query 1: Simple equality (age = 25)');
	const start1 = performance.now();
	const result1 = await instance.query({
		query: { selector: { age: 25 }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end1 = performance.now();
	console.log(`   Found ${result1.documents.length} documents in ${(end1 - start1).toFixed(2)}ms\n`);

	console.log('⏱️  Query 2: Greater than (age > 50)');
	const start2 = performance.now();
	const result2 = await instance.query({
		query: { selector: { age: { $gt: 50 } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end2 = performance.now();
	console.log(`   Found ${result2.documents.length} documents in ${(end2 - start2).toFixed(2)}ms\n`);

	console.log('⏱️  Query 3: Multiple conditions (age > 30 AND status = "active")');
	const start3 = performance.now();
	const result3 = await instance.query({
		query: { selector: { age: { $gt: 30 }, status: 'active' }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end3 = performance.now();
	console.log(`   Found ${result3.documents.length} documents in ${(end3 - start3).toFixed(2)}ms\n`);

	console.log('⏱️  Query 4: Range query (age >= 20 AND age <= 40)');
	const start4 = performance.now();
	const result4 = await instance.query({
		query: { selector: { age: { $gte: 20, $lte: 40 } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end4 = performance.now();
	console.log(`   Found ${result4.documents.length} documents in ${(end4 - start4).toFixed(2)}ms\n`);

	console.log('⏱️  Query 5: $in operator (age in [25, 30, 35, 40])');
	const start5 = performance.now();
	const result5 = await instance.query({
		query: { selector: { age: { $in: [25, 30, 35, 40] } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end5 = performance.now();
	console.log(`   Found ${result5.documents.length} documents in ${(end5 - start5).toFixed(2)}ms\n`);

	console.log('⏱️  Query 6: $or operator (age < 20 OR age > 60)');
	const start6 = performance.now();
	const result6 = await instance.query({
		query: { selector: { $or: [{ age: { $lt: 20 } }, { age: { $gt: 60 } }] }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end6 = performance.now();
	console.log(`   Found ${result6.documents.length} documents in ${(end6 - start6).toFixed(2)}ms\n`);

	console.log('⏱️  Query 7: $nin operator (status not in ["pending", "archived"])');
	const start7 = performance.now();
	const result7 = await instance.query({
		query: { selector: { status: { $nin: ['pending', 'archived'] } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end7 = performance.now();
	console.log(`   Found ${result7.documents.length} documents in ${(end7 - start7).toFixed(2)}ms\n`);

	console.log('⏱️  Query 8: Complex nested ($or + $and + $in)');
	const start8 = performance.now();
	const result8 = await instance.query({
		query: { selector: { $or: [{ $and: [{ age: { $gte: 30 } }, { status: 'active' }] }, { age: { $in: [18, 19, 20] } }] }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end8 = performance.now();
	console.log(`   Found ${result8.documents.length} documents in ${(end8 - start8).toFixed(2)}ms\n`);

	const avgTime = ((end1 - start1) + (end2 - start2) + (end3 - start3) + (end4 - start4) + (end5 - start5) + (end6 - start6) + (end7 - start7) + (end8 - start8)) / 8;
	console.log(`📊 Average query time: ${avgTime.toFixed(2)}ms`);
	console.log(`\n✅ Phase 3 includes advanced operators: $in, $nin, $or, $and`);
	console.log(`   Expected speedup: 10-100x for large datasets (vs Phase 1 in-memory filtering)\n`);

	await instance.close();
}

benchmark().catch(console.error);
