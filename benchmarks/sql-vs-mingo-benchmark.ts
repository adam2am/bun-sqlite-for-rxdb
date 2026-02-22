import { getRxStorageBunSQLite } from '../src/storage';
import type { RxDocumentData } from 'rxdb';

interface BenchmarkDocType {
	id: string;
	name: string;
	age: number;
	email?: string;
	status: string;
	tags?: string[];
}

async function benchmarkAtScale(docCount: number) {
	console.log(`\n${'='.repeat(60)}`);
	console.log(`🏴‍☠️ SQL vs Mingo Benchmark: ${docCount.toLocaleString()} documents`);
	console.log(`${'='.repeat(60)}\n`);

	const storage = getRxStorageBunSQLite();
	const instance = await storage.createStorageInstance<BenchmarkDocType>({
		databaseInstanceToken: `benchmark-token-${docCount}`,
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
				tags: { type: 'array', items: { type: 'string' } },
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

	console.log(`📝 Inserting ${docCount.toLocaleString()} documents...`);
	const insertStart = performance.now();
	
	const batchSize = 1000;
	for (let batch = 0; batch < docCount / batchSize; batch++) {
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
			} else if (idx % 3 === 1) {
				doc.email = `user${idx}@yahoo.com`;
			}
			
			if (idx % 2 === 0) {
				doc.tags = ['active', 'premium'];
			}
			
			docs.push({ document: doc });
		}
		await instance.bulkWrite(docs, 'benchmark');
		if ((batch + 1) % 10 === 0) {
			process.stdout.write(`\r   Progress: ${((batch + 1) * batchSize).toLocaleString()} / ${docCount.toLocaleString()}`);
		}
	}
	
	const insertEnd = performance.now();
	console.log(`\n✅ Inserted ${docCount.toLocaleString()} documents in ${(insertEnd - insertStart).toFixed(2)}ms\n`);

	const memBefore = process.memoryUsage();

	console.log('📊 Test 1: $exists operator (email field exists)');
	console.log('   SQL: WHERE email IS NOT NULL');
	const start1 = performance.now();
	const result1 = await instance.query({
		query: { selector: { email: { $exists: true } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end1 = performance.now();
	console.log(`   ✅ Found ${result1.documents.length.toLocaleString()} docs in ${(end1 - start1).toFixed(2)}ms\n`);

	console.log('📊 Test 2: $regex operator (name starts with "User 1")');
	console.log('   SQL: WHERE name LIKE "User 1%"');
	const start2 = performance.now();
	const result2 = await instance.query({
		query: { selector: { name: { $regex: '^User 1' } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end2 = performance.now();
	console.log(`   ✅ Found ${result2.documents.length.toLocaleString()} docs in ${(end2 - start2).toFixed(2)}ms\n`);

	console.log('📊 Test 3: $gt operator (age > 50)');
	console.log('   SQL: WHERE age > 50');
	const start3 = performance.now();
	const result3 = await instance.query({
		query: { selector: { age: { $gt: 50 } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end3 = performance.now();
	console.log(`   ✅ Found ${result3.documents.length.toLocaleString()} docs in ${(end3 - start3).toFixed(2)}ms\n`);

	console.log('📊 Test 4: $in operator (status in [active, pending])');
	console.log('   SQL: WHERE status IN ("active", "pending")');
	const start4 = performance.now();
	const result4 = await instance.query({
		query: { selector: { status: { $in: ['active', 'pending'] } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end4 = performance.now();
	console.log(`   ✅ Found ${result4.documents.length.toLocaleString()} docs in ${(end4 - start4).toFixed(2)}ms\n`);

	console.log('📊 Test 5: $elemMatch operator (tags contains "premium")');
	console.log('   Mingo: In-memory filter (no SQL translation)');
	const start5 = performance.now();
	const result5 = await instance.query({
		query: { selector: { tags: { $elemMatch: { $eq: 'premium' } } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end5 = performance.now();
	console.log(`   ✅ Found ${result5.documents.length.toLocaleString()} docs in ${(end5 - start5).toFixed(2)}ms\n`);

	const memAfter = process.memoryUsage();
	const memDelta = {
		rss: ((memAfter.rss - memBefore.rss) / 1024 / 1024).toFixed(2),
		heapUsed: ((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2)
	};

	console.log(`${'='.repeat(60)}`);
	console.log('📊 RESULTS SUMMARY');
	console.log(`${'='.repeat(60)}`);
	console.log(`SQL Operators ($exists, $regex, $gt, $in):`);
	console.log(`  - $exists: ${(end1 - start1).toFixed(2)}ms`);
	console.log(`  - $regex:  ${(end2 - start2).toFixed(2)}ms`);
	console.log(`  - $gt:     ${(end3 - start3).toFixed(2)}ms`);
	console.log(`  - $in:     ${(end4 - start4).toFixed(2)}ms`);
	console.log(`  - Average: ${((end1 - start1 + end2 - start2 + end3 - start3 + end4 - start4) / 4).toFixed(2)}ms`);
	console.log();
	console.log(`Mingo Fallback ($elemMatch):`);
	console.log(`  - $elemMatch: ${(end5 - start5).toFixed(2)}ms`);
	console.log();
	console.log(`Memory Delta:`);
	console.log(`  - RSS: ${memDelta.rss}MB`);
	console.log(`  - Heap: ${memDelta.heapUsed}MB`);
	console.log(`${'='.repeat(60)}\n`);

	await instance.close();

	return {
		sqlAvg: (end1 - start1 + end2 - start2 + end3 - start3 + end4 - start4) / 4,
		mingoTime: end5 - start5,
		memDelta
	};
}

async function main() {
	console.log('🏴‍☠️ SQL vs Mingo Performance Comparison');
	console.log('Testing with bun:sqlite native driver\n');

	const results10k = await benchmarkAtScale(10000);
	const results100k = await benchmarkAtScale(100000);

	console.log('\n' + '='.repeat(60));
	console.log('🎯 FINAL VERDICT');
	console.log('='.repeat(60));
	console.log('\n10k documents:');
	console.log(`  SQL avg:    ${results10k.sqlAvg.toFixed(2)}ms`);
	console.log(`  Mingo:      ${results10k.mingoTime.toFixed(2)}ms`);
	console.log(`  Ratio:      ${(results10k.mingoTime / results10k.sqlAvg).toFixed(2)}x`);
	
	console.log('\n100k documents:');
	console.log(`  SQL avg:    ${results100k.sqlAvg.toFixed(2)}ms`);
	console.log(`  Mingo:      ${results100k.mingoTime.toFixed(2)}ms`);
	console.log(`  Ratio:      ${(results100k.mingoTime / results100k.sqlAvg).toFixed(2)}x`);

	console.log('\n' + '='.repeat(60));
	if (results100k.mingoTime / results100k.sqlAvg > 5) {
		console.log('✅ VERDICT: SQL translation is WORTH IT at scale (5x+ faster)');
		console.log('   Continue hybrid approach: SQL for simple, Mingo for complex');
	} else if (results100k.mingoTime / results100k.sqlAvg > 2) {
		console.log('⚠️  VERDICT: SQL is faster but not dramatically (2-5x)');
		console.log('   Hybrid approach is reasonable, but Mingo-only is viable');
	} else {
		console.log('❌ VERDICT: SQL translation NOT worth the effort (<2x speedup)');
		console.log('   Consider using Mingo everywhere for simplicity');
	}
	console.log('='.repeat(60) + '\n');
}

main().catch(console.error);
