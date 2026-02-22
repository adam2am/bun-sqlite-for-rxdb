import { getRxStorageBunSQLite } from '../src/storage';
import type { RxDocumentData } from 'rxdb';
import { Query } from 'mingo';

interface BenchmarkDocType {
	id: string;
	name: string;
	age: number;
	email?: string;
	status: string;
}

async function sqlVsMingoComparison() {
	console.log('🏴‍☠️ SQL vs Mingo: Head-to-Head Comparison\n');

	const storage = getRxStorageBunSQLite();
	const instance = await storage.createStorageInstance<BenchmarkDocType>({
		databaseInstanceToken: 'sql-vs-mingo-token',
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
			required: ['id', 'name', 'age', 'status', '_deleted', '_attachments', '_rev', '_meta']
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
	}
	
	const insertEnd = performance.now();
	console.log(`✅ Inserted 100,000 documents in ${(insertEnd - insertStart).toFixed(2)}ms\n`);

	console.log('='.repeat(60));
	console.log('Test 1: $gt operator (age > 50)');
	console.log('='.repeat(60));
	
	const sqlStart1 = performance.now();
	const sqlResult1 = await instance.query({
		query: { selector: { age: { $gt: 50 } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const sqlEnd1 = performance.now();
	console.log(`SQL (with indexes):  ${(sqlEnd1 - sqlStart1).toFixed(2)}ms - Found ${sqlResult1.documents.length.toLocaleString()} docs`);
	
	const mingoStart1 = performance.now();
	const allDocs1 = await instance.query({
		query: { selector: {}, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const mingoQuery1 = new Query({ age: { $gt: 50 } });
	const mingoResult1 = allDocs1.documents.filter(doc => mingoQuery1.test(doc));
	const mingoEnd1 = performance.now();
	console.log(`Mingo (in-memory):   ${(mingoEnd1 - mingoStart1).toFixed(2)}ms - Found ${mingoResult1.length.toLocaleString()} docs`);
	console.log(`Speedup: ${((mingoEnd1 - mingoStart1) / (sqlEnd1 - sqlStart1)).toFixed(2)}x faster with SQL\n`);

	console.log('='.repeat(60));
	console.log('Test 2: $eq operator (status = "active")');
	console.log('='.repeat(60));
	
	const sqlStart2 = performance.now();
	const sqlResult2 = await instance.query({
		query: { selector: { status: { $eq: 'active' } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const sqlEnd2 = performance.now();
	console.log(`SQL (with indexes):  ${(sqlEnd2 - sqlStart2).toFixed(2)}ms - Found ${sqlResult2.documents.length.toLocaleString()} docs`);
	
	const mingoStart2 = performance.now();
	const allDocs2 = await instance.query({
		query: { selector: {}, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const mingoQuery2 = new Query({ status: { $eq: 'active' } });
	const mingoResult2 = allDocs2.documents.filter(doc => mingoQuery2.test(doc));
	const mingoEnd2 = performance.now();
	console.log(`Mingo (in-memory):   ${(mingoEnd2 - mingoStart2).toFixed(2)}ms - Found ${mingoResult2.length.toLocaleString()} docs`);
	console.log(`Speedup: ${((mingoEnd2 - mingoStart2) / (sqlEnd2 - sqlStart2)).toFixed(2)}x faster with SQL\n`);

	console.log('='.repeat(60));
	console.log('Test 3: $in operator (status in ["active", "pending"])');
	console.log('='.repeat(60));
	
	const sqlStart3 = performance.now();
	const sqlResult3 = await instance.query({
		query: { selector: { status: { $in: ['active', 'pending'] } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const sqlEnd3 = performance.now();
	console.log(`SQL (with indexes):  ${(sqlEnd3 - sqlStart3).toFixed(2)}ms - Found ${sqlResult3.documents.length.toLocaleString()} docs`);
	
	const mingoStart3 = performance.now();
	const allDocs3 = await instance.query({
		query: { selector: {}, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const mingoQuery3 = new Query({ status: { $in: ['active', 'pending'] } });
	const mingoResult3 = allDocs3.documents.filter(doc => mingoQuery3.test(doc));
	const mingoEnd3 = performance.now();
	console.log(`Mingo (in-memory):   ${(mingoEnd3 - mingoStart3).toFixed(2)}ms - Found ${mingoResult3.length.toLocaleString()} docs`);
	console.log(`Speedup: ${((mingoEnd3 - mingoStart3) / (sqlEnd3 - sqlStart3)).toFixed(2)}x faster with SQL\n`);

	const sqlAvg = ((sqlEnd1 - sqlStart1) + (sqlEnd2 - sqlStart2) + (sqlEnd3 - sqlStart3)) / 3;
	const mingoAvg = ((mingoEnd1 - mingoStart1) + (mingoEnd2 - mingoStart2) + (mingoEnd3 - mingoStart3)) / 3;

	console.log('='.repeat(60));
	console.log('📊 FINAL RESULTS (100k documents)');
	console.log('='.repeat(60));
	console.log(`SQL (with indexes):  ${sqlAvg.toFixed(2)}ms average`);
	console.log(`Mingo (in-memory):   ${mingoAvg.toFixed(2)}ms average`);
	console.log(`Overall Speedup:     ${(mingoAvg / sqlAvg).toFixed(2)}x faster with SQL`);
	console.log('='.repeat(60));
	console.log();
	
	if (mingoAvg / sqlAvg > 2) {
		console.log('✅ VERDICT: SQL with indexes is SIGNIFICANTLY faster (2x+)');
		console.log('   Hybrid strategy VALIDATED: Use SQL for simple, Mingo for complex');
	} else if (mingoAvg / sqlAvg > 1.5) {
		console.log('⚠️  VERDICT: SQL is moderately faster (1.5-2x)');
		console.log('   Hybrid strategy is reasonable but not dramatic');
	} else {
		console.log('❌ VERDICT: SQL and Mingo are similar (<1.5x difference)');
		console.log('   Consider Mingo-only for simplicity');
	}
	console.log('='.repeat(60) + '\n');

	await instance.close();
}

sqlVsMingoComparison().catch(console.error);
