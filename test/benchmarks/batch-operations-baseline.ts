import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData } from 'rxdb';

interface BenchmarkDocType {
	id: string;
	name: string;
	age: number;
	_deleted: boolean;
	_attachments: {};
	_rev: string;
	_meta: { lwt: number };
}

function generateDocs(count: number, offset: number = 0): Array<{ document: RxDocumentData<BenchmarkDocType> }> {
	const docs: Array<{ document: RxDocumentData<BenchmarkDocType> }> = [];
	for (let i = 0; i < count; i++) {
		docs.push({
			document: {
				id: `user${offset + i}`,
				name: `User${i}`,
				age: 20 + (i % 50),
				_deleted: false,
				_attachments: {},
				_rev: '1-abc',
				_meta: { lwt: Date.now() }
			}
		});
	}
	return docs;
}

async function setupInstance() {
	const storage = getRxStorageBunSQLite();
	return await storage.createStorageInstance<BenchmarkDocType>({
		databaseInstanceToken: `batch-operations-baseline-${Date.now()}`,
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
}

async function benchmarkFixedBatchSize(instance: any) {
	console.log('\n📊 Test 1: Fixed Batch Size (100 docs × 10 iterations)');
	console.log('   Measures: Consistent performance with same batch size');
	console.log('   Expected: Fast (statement cache hit every time)\n');

	const times: number[] = [];
	const batchSize = 100;

	for (let i = 0; i < 10; i++) {
		const docs = generateDocs(batchSize, i * batchSize);
		
		const start = performance.now();
		await instance.bulkWrite(docs, 'benchmark');
		const end = performance.now();
		
		times.push(end - start);
	}

	const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
	const minTime = Math.min(...times);
	const maxTime = Math.max(...times);

	console.log(`   ⏱️  Avg: ${avgTime.toFixed(2)}ms | Min: ${minTime.toFixed(2)}ms | Max: ${maxTime.toFixed(2)}ms`);
	console.log(`   📊 Variance: ${((maxTime - minTime) / avgTime * 100).toFixed(1)}%`);
	
	return avgTime;
}

async function benchmarkVaryingBatchSizes(instance: any) {
	console.log('\n📊 Test 2: Varying Batch Sizes (THE KEY TEST)');
	console.log('   Measures: Statement cache thrashing with different batch sizes');
	console.log('   Expected: SLOW (cache miss on every size change)\n');

	const batchSizes = [42, 73, 100, 127, 200, 42, 100, 73, 200, 127];
	const times: number[] = [];
	let offset = 10000;

	for (const size of batchSizes) {
		const docs = generateDocs(size, offset);
		offset += size;
		
		const start = performance.now();
		await instance.bulkWrite(docs, 'benchmark');
		const end = performance.now();
		
		times.push(end - start);
		console.log(`   Size ${size.toString().padStart(3)}: ${(end - start).toFixed(2)}ms`);
	}

	const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
	const minTime = Math.min(...times);
	const maxTime = Math.max(...times);

	console.log(`\n   ⏱️  Avg: ${avgTime.toFixed(2)}ms | Min: ${minTime.toFixed(2)}ms | Max: ${maxTime.toFixed(2)}ms`);
	console.log(`   📊 Variance: ${((maxTime - minTime) / avgTime * 100).toFixed(1)}%`);
	
	return avgTime;
}

async function benchmarkLargeBatch(instance: any) {
	console.log('\n📊 Test 3: Large Single Batch (10,000 docs)');
	console.log('   Measures: Performance with large batch');
	console.log('   Expected: Moderate (string concatenation overhead)\n');

	const docs = generateDocs(10000, 50000);
	
	const start = performance.now();
	await instance.bulkWrite(docs, 'benchmark');
	const end = performance.now();
	
	const time = end - start;
	console.log(`   ⏱️  Time: ${time.toFixed(2)}ms`);
	console.log(`   📊 Throughput: ${(10000 / (time / 1000)).toFixed(0)} docs/sec`);
	
	return time;
}

async function main() {
	console.log('\n🏴‍☠️ Batch Operations - BASELINE BENCHMARK');
	console.log('Measuring BEFORE switching to single prepared statement\n');
	console.log('='.repeat(80));
	console.log('CURRENT IMPLEMENTATION: String concatenation with dynamic placeholders');
	console.log('PROBLEM: Each batch size generates different SQL → statement cache miss');
	console.log('='.repeat(80));

	const instance = await setupInstance();

	const fixedAvg = await benchmarkFixedBatchSize(instance);
	const varyingAvg = await benchmarkVaryingBatchSizes(instance);
	const largeTime = await benchmarkLargeBatch(instance);

	await instance.close();

	console.log('\n' + '='.repeat(80));
	console.log('📈 SUMMARY');
	console.log('='.repeat(80));
	
	console.log(`\nFixed batch size (100):    ${fixedAvg.toFixed(2)}ms avg`);
	console.log(`Varying batch sizes:       ${varyingAvg.toFixed(2)}ms avg`);
	console.log(`Large batch (10k):         ${largeTime.toFixed(2)}ms`);

	const overhead = ((varyingAvg / fixedAvg) - 1) * 100;
	console.log(`\n⚠️  Varying sizes are ${overhead.toFixed(0)}% slower (statement cache thrashing)`);

	console.log('\n💡 EXPECTED IMPROVEMENT AFTER FIX:');
	console.log('   Current: String concatenation → cache miss on size change');
	console.log('   After:   Single prepared statement → cache hit every time');
	console.log(`   Expected: Varying sizes should match fixed size (~${fixedAvg.toFixed(2)}ms)`);
	console.log(`   Speedup:  ${(varyingAvg / fixedAvg).toFixed(1)}x faster for varying sizes`);

	console.log('\n' + '='.repeat(80));
	console.log('✅ BASELINE ESTABLISHED');
	console.log('='.repeat(80));
	console.log('\nNext: Implement single prepared statement pattern, then re-run\n');
}

main().catch(console.error);
