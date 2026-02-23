import { getRxStorageBunSQLite } from '../src/storage';
import type { RxDocumentData } from 'rxdb';

interface BenchmarkDocType {
	id: string;
	name: string;
	age: number;
	email?: string;
	status: string;
}

async function benchmarkSchemaIndexes() {
	console.log('🏴‍☠️ schema.indexes Performance Benchmark\n');
	console.log('Goal: Measure baseline performance BEFORE implementing schema.indexes');
	console.log('After implementation, run again to measure improvement\n');

	const storage = getRxStorageBunSQLite();
	const instance = await storage.createStorageInstance<BenchmarkDocType>({
		databaseInstanceToken: 'schema-indexes-benchmark-token',
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
				email: { type: 'string' },
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
		required: ['id', 'name', 'age', 'status', '_deleted', '_attachments', '_rev', '_meta'],
		indexes: ['age', 'status', ['age', 'status']]
	},
		options: {},
		multiInstance: false,
		devMode: false
	});

	console.log('📝 Inserting 100,000 documents...');
	const insertStart = performance.now();
	
	const batchSize = 1000;
	for (let batch = 0; batch < 100; batch++) {
		const docs: Array<{ document: RxDocumentData<BenchmarkDocType> }> = [];
		for (let i = 0; i < batchSize; i++) {
			const idx = batch * batchSize + i;
			const doc: any = {
				id: `user${idx}`,
				name: `User ${idx}`,
				age: 18 + (idx % 50),
				status: idx % 2 === 0 ? 'active' : 'inactive',
				_deleted: false,
				_attachments: {},
				_rev: '1-abc',
				_meta: { lwt: Date.now() }
			};
			
			if (idx % 3 === 0) {
				doc.email = `user${idx}@gmail.com`;
			}
			
			docs.push({ document: doc });
		}
		await instance.bulkWrite(docs, 'benchmark');
		if ((batch + 1) % 10 === 0) {
			process.stdout.write(`\r   Progress: ${((batch + 1) * batchSize).toLocaleString()} / 100,000`);
		}
	}
	
	const insertEnd = performance.now();
	console.log(`\n✅ Inserted 100,000 documents in ${(insertEnd - insertStart).toFixed(2)}ms\n`);

	console.log('📊 Test 1: age > 50 (should benefit from age index)');
	const start1 = performance.now();
	const result1 = await instance.query({
		query: { selector: { age: { $gt: 50 } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end1 = performance.now();
	console.log(`   ✅ Found ${result1.documents.length.toLocaleString()} docs in ${(end1 - start1).toFixed(2)}ms\n`);

	console.log('📊 Test 2: status = "active" (should benefit from status index)');
	const start2 = performance.now();
	const result2 = await instance.query({
		query: { selector: { status: { $eq: 'active' } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end2 = performance.now();
	console.log(`   ✅ Found ${result2.documents.length.toLocaleString()} docs in ${(end2 - start2).toFixed(2)}ms\n`);

	console.log('📊 Test 3: age > 30 AND status = "active" (should benefit from compound index)');
	const start3 = performance.now();
	const result3 = await instance.query({
		query: { selector: { age: { $gt: 30 }, status: { $eq: 'active' } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end3 = performance.now();
	console.log(`   ✅ Found ${result3.documents.length.toLocaleString()} docs in ${(end3 - start3).toFixed(2)}ms\n`);

	console.log('📊 Test 4: age BETWEEN 25 AND 35 (should benefit from age index)');
	const start4 = performance.now();
	const result4 = await instance.query({
		query: { selector: { age: { $gte: 25, $lte: 35 } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end4 = performance.now();
	console.log(`   ✅ Found ${result4.documents.length.toLocaleString()} docs in ${(end4 - start4).toFixed(2)}ms\n`);

	const avg = (end1 - start1 + end2 - start2 + end3 - start3 + end4 - start4) / 4;

	console.log('='.repeat(60));
	console.log('📊 BASELINE RESULTS (100k documents, NO custom indexes)');
	console.log('='.repeat(60));
	console.log(`Test 1 (age > 50):              ${(end1 - start1).toFixed(2)}ms`);
	console.log(`Test 2 (status = "active"):     ${(end2 - start2).toFixed(2)}ms`);
	console.log(`Test 3 (age > 30 AND status):   ${(end3 - start3).toFixed(2)}ms`);
	console.log(`Test 4 (age BETWEEN 25-35):     ${(end4 - start4).toFixed(2)}ms`);
	console.log(`Average:                        ${avg.toFixed(2)}ms`);
	console.log('='.repeat(60));
	console.log();
	console.log('📝 Next steps:');
	console.log('   1. Implement schema.indexes support');
	console.log('   2. Uncomment indexes in schema (line 43)');
	console.log('   3. Run this benchmark again');
	console.log('   4. Compare results to measure improvement');
	console.log('='.repeat(60) + '\n');

	await instance.close();
}

benchmarkSchemaIndexes().catch(console.error);
