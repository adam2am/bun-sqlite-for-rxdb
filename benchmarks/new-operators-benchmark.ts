import { getRxStorageBunSQLite } from '../src/storage';
import type { RxDocumentData } from 'rxdb';

interface BenchmarkDocType {
	id: string;
	name: string;
	age: number;
	email?: string;
	tags?: string[];
}

async function benchmark() {
	console.log('🏴‍☠️ Benchmarking New Operators ($exists, $regex, $elemMatch)...\n');

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
				email: { type: 'string' },
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
			required: ['id', 'name', 'age', '_deleted', '_attachments', '_rev', '_meta']
		},
		options: {},
		multiInstance: false,
		devMode: false
	});

	console.log('📝 Inserting 10,000 documents...');
	const docs: Array<{ document: RxDocumentData<BenchmarkDocType> }> = [];
	for (let i = 0; i < 10000; i++) {
		const doc: any = {
			id: `user${i}`,
			name: `User ${i}`,
			age: 18 + (i % 50),
			_deleted: false,
			_attachments: {},
			_rev: '1-abc',
			_meta: { lwt: Date.now() }
		};
		
		if (i % 3 === 0) {
			doc.email = `user${i}@gmail.com`;
		} else if (i % 3 === 1) {
			doc.email = `user${i}@yahoo.com`;
		}
		
		if (i % 2 === 0) {
			doc.tags = ['active', 'premium'];
		}
		
		docs.push({ document: doc });
	}

	await instance.bulkWrite(docs, 'benchmark');
	console.log('✅ Inserted 10,000 documents\n');

	console.log('⏱️  Query 1: $exists true (email exists)');
	const start1 = performance.now();
	const result1 = await instance.query({
		query: { selector: { email: { $exists: true } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end1 = performance.now();
	console.log(`   Found ${result1.documents.length} documents in ${(end1 - start1).toFixed(2)}ms\n`);

	console.log('⏱️  Query 2: $exists false (email does not exist)');
	const start2 = performance.now();
	const result2 = await instance.query({
		query: { selector: { email: { $exists: false } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end2 = performance.now();
	console.log(`   Found ${result2.documents.length} documents in ${(end2 - start2).toFixed(2)}ms\n`);

	console.log('⏱️  Query 3: $regex starts with (name starts with "User 1")');
	const start3 = performance.now();
	const result3 = await instance.query({
		query: { selector: { name: { $regex: '^User 1' } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end3 = performance.now();
	console.log(`   Found ${result3.documents.length} documents in ${(end3 - start3).toFixed(2)}ms\n`);

	console.log('⏱️  Query 4: $regex ends with (email ends with @gmail.com)');
	const start4 = performance.now();
	const result4 = await instance.query({
		query: { selector: { email: { $regex: '@gmail\\.com$' } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end4 = performance.now();
	console.log(`   Found ${result4.documents.length} documents in ${(end4 - start4).toFixed(2)}ms\n`);

	console.log('⏱️  Query 5: $regex case-insensitive (name contains "user")');
	const start5 = performance.now();
	const result5 = await instance.query({
		query: { selector: { name: { $regex: 'user', $options: 'i' } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end5 = performance.now();
	console.log(`   Found ${result5.documents.length} documents in ${(end5 - start5).toFixed(2)}ms\n`);

	console.log('⏱️  Query 6: $elemMatch (tags contains "premium") [Mingo fallback]');
	const start6 = performance.now();
	const result6 = await instance.query({
		query: { selector: { tags: { $elemMatch: { $eq: 'premium' } } }, sort: [], skip: 0 },
		queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
	});
	const end6 = performance.now();
	console.log(`   Found ${result6.documents.length} documents in ${(end6 - start6).toFixed(2)}ms\n`);

	const avgTime = ((end1 - start1) + (end2 - start2) + (end3 - start3) + (end4 - start4) + (end5 - start5) + (end6 - start6)) / 6;
	console.log(`📊 Average query time: ${avgTime.toFixed(2)}ms`);
	console.log(`\n✅ New operators benchmarked:`);
	console.log(`   - $exists: SQL IS NULL/IS NOT NULL (fast)`);
	console.log(`   - $regex: SQL LIKE with COLLATE NOCASE (fast for simple patterns)`);
	console.log(`   - $elemMatch: Mingo fallback (slower, but correct)\n`);

	await instance.close();
}

benchmark().catch(console.error);
