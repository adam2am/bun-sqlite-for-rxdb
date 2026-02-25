import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData } from 'rxdb';

interface BenchmarkDocType {
	id: string;
	name: string;
	age: number;
	status: string;
	_deleted: boolean;
	_attachments: Record<string, unknown>;
	_rev: string;
	_meta: { lwt: number };
}

async function setupTestData(docCount: number) {
	const storage = getRxStorageBunSQLite();
	const instance = await storage.createStorageInstance<BenchmarkDocType>({
		databaseInstanceToken: `phase1-baseline-${Date.now()}`,
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

	console.log(`📝 Inserting ${docCount.toLocaleString()} documents...`);
	
	const batchSize = 1000;
	for (let batch = 0; batch < Math.ceil(docCount / batchSize); batch++) {
		const docs: Array<{ document: RxDocumentData<BenchmarkDocType> }> = [];
		const start = batch * batchSize;
		const end = Math.min(start + batchSize, docCount);
		
		for (let i = start; i < end; i++) {
			docs.push({
				document: {
					id: `user${i}`,
					name: `Alice${i % 100}`,
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
	}
	
	console.log(`✅ Inserted ${docCount.toLocaleString()} documents\n`);
	
	return instance;
}

function calculateStats(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	const avg = values.reduce((a, b) => a + b, 0) / values.length;
	const min = sorted[0];
	const max = sorted[sorted.length - 1];
	const median = sorted[Math.floor(sorted.length / 2)];
	const stdDev = Math.sqrt(values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length);
	return { avg, min, max, median, stdDev };
}

async function benchmark10k() {
	console.log('='.repeat(70));
	console.log('📊 10k DOCUMENTS (20 runs)');
	console.log('='.repeat(70));

	const instance = await setupTestData(10000);

	const results = {
		countSimple: [] as number[],
		countComplex: [] as number[],
		bulkWrite1: [] as number[],
		bulkWrite10: [] as number[],
		bulkWrite100: [] as number[],
		queryEq: [] as number[],
		queryGt: [] as number[],
		queryLt: [] as number[],
		queryAnd: [] as number[],
		queryOr: [] as number[],
		queryRepeated: [] as number[],
		findDocById1: [] as number[],
		findDocById5: [] as number[],
		findDocById10: [] as number[],
		findDocById20: [] as number[],
		findDocById50: [] as number[]
	};

	for (let run = 1; run <= 20; run++) {
		const start1 = performance.now();
		await instance.count({
			query: { selector: { status: { $eq: 'active' } }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		results.countSimple.push(performance.now() - start1);

		const start2 = performance.now();
		await instance.count({
			query: { selector: { $and: [{ age: { $gt: 30 } }, { status: { $eq: 'active' } }] }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		results.countComplex.push(performance.now() - start2);

		const start3 = performance.now();
		await instance.bulkWrite([{
			document: { id: `bulk1-${run}`, name: 'Bulk', age: 25, status: 'active', _deleted: false, _attachments: {}, _rev: '1-xyz', _meta: { lwt: Date.now() } }
		}], 'benchmark');
		results.bulkWrite1.push(performance.now() - start3);

		const start4 = performance.now();
		await instance.bulkWrite(Array.from({ length: 10 }, (_, i) => ({
			document: { id: `bulk10-${run}-${i}`, name: 'Bulk', age: 25, status: 'active', _deleted: false, _attachments: {}, _rev: '1-xyz', _meta: { lwt: Date.now() } }
		})), 'benchmark');
		results.bulkWrite10.push(performance.now() - start4);

		const start4b = performance.now();
		await instance.bulkWrite(Array.from({ length: 100 }, (_, i) => ({
			document: { id: `bulk100-${run}-${i}`, name: 'Bulk', age: 25, status: 'active', _deleted: false, _attachments: {}, _rev: '1-xyz', _meta: { lwt: Date.now() } }
		})), 'benchmark');
		results.bulkWrite100.push(performance.now() - start4b);

		const start5 = performance.now();
		await instance.query({
			query: { selector: { status: { $eq: 'active' } }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		results.queryEq.push(performance.now() - start5);

		const start6 = performance.now();
		await instance.query({
			query: { selector: { age: { $gt: 30 } }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		results.queryGt.push(performance.now() - start6);

		const start6b = performance.now();
		await instance.query({
			query: { selector: { age: { $lt: 40 } }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		results.queryLt.push(performance.now() - start6b);

		const start6c = performance.now();
		await instance.query({
			query: { selector: { $and: [{ age: { $gte: 25 } }, { age: { $lte: 35 } }] }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		results.queryAnd.push(performance.now() - start6c);

		const start6d = performance.now();
		await instance.query({
			query: { selector: { $or: [{ status: { $eq: 'active' } }, { age: { $lt: 25 } }] }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		results.queryOr.push(performance.now() - start6d);

		const start6e = performance.now();
		await instance.query({
			query: { selector: { status: { $eq: 'active' } }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		results.queryRepeated.push(performance.now() - start6e);

		const start7 = performance.now();
		await instance.findDocumentsById([`user${run}`], false);
		results.findDocById1.push(performance.now() - start7);

		const start8 = performance.now();
		await instance.findDocumentsById([`user${run}`, `user${run+1}`, `user${run+2}`, `user${run+3}`, `user${run+4}`], false);
		results.findDocById5.push(performance.now() - start8);

		const start9 = performance.now();
		await instance.findDocumentsById(Array.from({ length: 10 }, (_, i) => `user${run+i}`), false);
		results.findDocById10.push(performance.now() - start9);

		const start10 = performance.now();
		await instance.findDocumentsById(Array.from({ length: 20 }, (_, i) => `user${run+i}`), false);
		results.findDocById20.push(performance.now() - start10);

		const start11 = performance.now();
		await instance.findDocumentsById(Array.from({ length: 50 }, (_, i) => `user${run+i}`), false);
		results.findDocById50.push(performance.now() - start11);

		if (run % 5 === 0) console.log(`  Run ${run}/20 complete`);
	}

	await instance.close();

	console.log('\n| Operation | Avg | Min | Max | Median | StdDev |');
	console.log('|-----------|-----|-----|-----|--------|--------|');
	for (const [key, values] of Object.entries(results)) {
		const stats = calculateStats(values);
		console.log(`| ${key} | ${stats.avg.toFixed(2)}ms | ${stats.min.toFixed(2)}ms | ${stats.max.toFixed(2)}ms | ${stats.median.toFixed(2)}ms | ${stats.stdDev.toFixed(2)}ms |`);
	}
	console.log();

	return results;
}

async function benchmark100k() {
	console.log('='.repeat(70));
	console.log('📊 100k DOCUMENTS (10 runs)');
	console.log('='.repeat(70));

	const instance = await setupTestData(100000);

	const results = {
		countSimple: [] as number[],
		countComplex: [] as number[]
	};

	for (let run = 1; run <= 10; run++) {
		const start1 = performance.now();
		await instance.count({
			query: { selector: { status: { $eq: 'active' } }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		results.countSimple.push(performance.now() - start1);

		const start2 = performance.now();
		await instance.count({
			query: { selector: { $and: [{ age: { $gt: 30 } }, { status: { $eq: 'active' } }] }, sort: [{ id: 'asc' }], skip: 0 },
			queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
		});
		results.countComplex.push(performance.now() - start2);

		if (run % 2 === 0) console.log(`  Run ${run}/10 complete`);
	}

	await instance.close();

	console.log('\n| Operation | Avg | Min | Max | Median | StdDev |');
	console.log('|-----------|-----|-----|-----|--------|--------|');
	for (const [key, values] of Object.entries(results)) {
		const stats = calculateStats(values);
		console.log(`| ${key} | ${stats.avg.toFixed(2)}ms | ${stats.min.toFixed(2)}ms | ${stats.max.toFixed(2)}ms | ${stats.median.toFixed(2)}ms | ${stats.stdDev.toFixed(2)}ms |`);
	}
	console.log();

	return results;
}

async function main() {
	console.log('🏴‍☠️ Phase 1 Baseline Benchmark (10 full runs)\n');
	console.log('Testing: count(), bulkWrite(), query()');
	console.log('Scales: 10k (20 runs), 100k (10 runs)\n');

	const allResults10k = {
		countSimple: [] as number[],
		countComplex: [] as number[],
		bulkWrite1: [] as number[],
		bulkWrite10: [] as number[],
		bulkWrite100: [] as number[],
		queryEq: [] as number[],
		queryGt: [] as number[],
		queryLt: [] as number[],
		queryAnd: [] as number[],
		queryOr: [] as number[],
		queryRepeated: [] as number[],
		findDocById1: [] as number[],
		findDocById5: [] as number[],
		findDocById10: [] as number[],
		findDocById20: [] as number[],
		findDocById50: [] as number[]
	};

	const allResults100k = {
		countSimple: [] as number[],
		countComplex: [] as number[]
	};

	for (let fullRun = 1; fullRun <= 10; fullRun++) {
		console.log(`\n${'='.repeat(70)}`);
		console.log(`FULL RUN ${fullRun}/10`);
		console.log('='.repeat(70));

		const results10k = await benchmark10k();
		const results100k = await benchmark100k();

		// Aggregate results
		for (const [key, values] of Object.entries(results10k)) {
			allResults10k[key as keyof typeof allResults10k].push(...values);
		}
		for (const [key, values] of Object.entries(results100k)) {
			allResults100k[key as keyof typeof allResults100k].push(...values);
		}
	}

	console.log('\n' + '='.repeat(70));
	console.log('📊 AGGREGATED RESULTS (10 full runs)');
	console.log('='.repeat(70));

	console.log('\n10k Documents (200 total runs):');
	console.log('| Operation | Avg | Min | Max | Median | StdDev |');
	console.log('|-----------|-----|-----|-----|--------|--------|');
	for (const [key, values] of Object.entries(allResults10k)) {
		const stats = calculateStats(values);
		console.log(`| ${key} | ${stats.avg.toFixed(2)}ms | ${stats.min.toFixed(2)}ms | ${stats.max.toFixed(2)}ms | ${stats.median.toFixed(2)}ms | ${stats.stdDev.toFixed(2)}ms |`);
	}

	console.log('\n100k Documents (100 total runs):');
	console.log('| Operation | Avg | Min | Max | Median | StdDev |');
	console.log('|-----------|-----|-----|-----|--------|--------|');
	for (const [key, values] of Object.entries(allResults100k)) {
		const stats = calculateStats(values);
		console.log(`| ${key} | ${stats.avg.toFixed(2)}ms | ${stats.min.toFixed(2)}ms | ${stats.max.toFixed(2)}ms | ${stats.median.toFixed(2)}ms | ${stats.stdDev.toFixed(2)}ms |`);
	}

	console.log('\n' + '='.repeat(70));
	console.log('✅ BASELINE COMPLETE');
	console.log('='.repeat(70));
	console.log('\n📝 Save these results to compare with optimized version!\n');
}

main().catch(console.error);
