import { Database } from "bun:sqlite";

interface BenchmarkRow {
	data: string;
}

async function benchmarkTextVsJsonb() {
	console.log('🏴‍☠️ TEXT vs JSONB: Storage Format Comparison (1M scale)\n');

	const dbText = new Database(":memory:");
	const dbJsonb = new Database(":memory:");
	
	const versionRow = dbText.query('SELECT sqlite_version() as version').get() as { version: string };
	console.log(`SQLite version: ${versionRow.version}\n`);
	
	dbText.run(`CREATE TABLE users (id TEXT PRIMARY KEY, data TEXT)`);
	dbText.run(`CREATE INDEX idx_age ON users(json_extract(data, '$.age'))`);
	dbText.run(`CREATE INDEX idx_status ON users(json_extract(data, '$.status'))`);
	
	dbJsonb.run(`CREATE TABLE users (id TEXT PRIMARY KEY, data BLOB)`);
	dbJsonb.run(`CREATE INDEX idx_age ON users(json_extract(data, '$.age'))`);
	dbJsonb.run(`CREATE INDEX idx_status ON users(json_extract(data, '$.status'))`);

	console.log('📝 Inserting 1,000,000 documents...');
	
	const textInsertStmt = dbText.prepare('INSERT INTO users (id, data) VALUES (?, ?)');
	const textInsertMany = dbText.transaction((docs: Array<{ id: string; data: any }>) => {
		for (const doc of docs) {
			textInsertStmt.run(doc.id, JSON.stringify(doc.data));
		}
	});
	
	const jsonbInsertStmt = dbJsonb.prepare('INSERT INTO users (id, data) VALUES (?, jsonb(?))');
	const jsonbInsertMany = dbJsonb.transaction((docs: Array<{ id: string; data: any }>) => {
		for (const doc of docs) {
			jsonbInsertStmt.run(doc.id, JSON.stringify(doc.data));
		}
	});
	
	const batchSize = 10000;
	for (let batch = 0; batch < 100; batch++) {
		const docs: Array<{ id: string; data: any }> = [];
		for (let i = 0; i < batchSize; i++) {
			const idx = batch * batchSize + i;
			docs.push({
				id: `user${idx}`,
				data: { 
					name: `User ${idx}`,
					age: 18 + (idx % 50),
					email: `user${idx}@example.com`,
					status: idx % 2 === 0 ? 'active' : 'inactive',
					bio: `Biography for user ${idx} with interests in technology, music, and travel.`
				}
			});
		}
		textInsertMany(docs);
		jsonbInsertMany(docs);
		
		if ((batch + 1) % 10 === 0) {
			console.log(`  Inserted ${(batch + 1) * batchSize} documents...`);
		}
	}
	console.log('✅ Inserted 1,000,000 documents\n');

	console.log('='.repeat(60));
	console.log('Test 1: Simple query (age > 50) - 15 runs');
	console.log('='.repeat(60));
	
	const textTimes1: number[] = [];
	const jsonbTimes1: number[] = [];
	
	for (let run = 1; run <= 15; run++) {
		const textStart = performance.now();
		dbText.query(`SELECT * FROM users WHERE json_extract(data, '$.age') > ?`).all(50);
		const textEnd = performance.now();
		textTimes1.push(textEnd - textStart);
		
		const jsonbStart = performance.now();
		dbJsonb.query(`SELECT * FROM users WHERE json_extract(data, '$.age') > ?`).all(50);
		const jsonbEnd = performance.now();
		jsonbTimes1.push(jsonbEnd - jsonbStart);
		
		console.log(`Run ${run}: TEXT=${(textEnd - textStart).toFixed(2)}ms, JSONB=${(jsonbEnd - jsonbStart).toFixed(2)}ms`);
	}
	
	const textAvg1 = textTimes1.reduce((a, b) => a + b, 0) / textTimes1.length;
	const jsonbAvg1 = jsonbTimes1.reduce((a, b) => a + b, 0) / jsonbTimes1.length;
	
	console.log(`\nTEXT average:  ${textAvg1.toFixed(2)}ms`);
	console.log(`JSONB average: ${jsonbAvg1.toFixed(2)}ms`);
	console.log(`Speedup:       ${(textAvg1 / jsonbAvg1).toFixed(2)}x\n`);

	console.log('='.repeat(60));
	console.log('Test 2: Complex query (age > 30 AND status = active) - 15 runs');
	console.log('='.repeat(60));
	
	const textTimes2: number[] = [];
	const jsonbTimes2: number[] = [];
	
	for (let run = 1; run <= 15; run++) {
		const textStart = performance.now();
		dbText.query(`SELECT * FROM users WHERE json_extract(data, '$.age') > ? AND json_extract(data, '$.status') = ?`).all(30, 'active');
		const textEnd = performance.now();
		textTimes2.push(textEnd - textStart);
		
		const jsonbStart = performance.now();
		dbJsonb.query(`SELECT * FROM users WHERE json_extract(data, '$.age') > ? AND json_extract(data, '$.status') = ?`).all(30, 'active');
		const jsonbEnd = performance.now();
		jsonbTimes2.push(jsonbEnd - jsonbStart);
		
		console.log(`Run ${run}: TEXT=${(textEnd - textStart).toFixed(2)}ms, JSONB=${(jsonbEnd - jsonbStart).toFixed(2)}ms`);
	}
	
	const textAvg2 = textTimes2.reduce((a, b) => a + b, 0) / textTimes2.length;
	const jsonbAvg2 = jsonbTimes2.reduce((a, b) => a + b, 0) / jsonbTimes2.length;
	
	console.log(`\nTEXT average:  ${textAvg2.toFixed(2)}ms`);
	console.log(`JSONB average: ${jsonbAvg2.toFixed(2)}ms`);
	console.log(`Speedup:       ${(textAvg2 / jsonbAvg2).toFixed(2)}x\n`);

	console.log('='.repeat(60));
	console.log('Test 3: Read and parse (SELECT + JSON.parse) - 15 runs');
	console.log('='.repeat(60));
	
	const textTimes3: number[] = [];
	const jsonbTimes3: number[] = [];
	
	for (let run = 1; run <= 15; run++) {
		const textStart = performance.now();
		const textRows = dbText.query(`SELECT data FROM users LIMIT 1000`).all() as BenchmarkRow[];
		for (const row of textRows) {
			JSON.parse(row.data);
		}
		const textEnd = performance.now();
		textTimes3.push(textEnd - textStart);
		
		const jsonbStart = performance.now();
		const jsonbRows = dbJsonb.query(`SELECT json(data) as data FROM users LIMIT 1000`).all() as BenchmarkRow[];
		for (const row of jsonbRows) {
			JSON.parse(row.data);
		}
		const jsonbEnd = performance.now();
		jsonbTimes3.push(jsonbEnd - jsonbStart);
		
		console.log(`Run ${run}: TEXT=${(textEnd - textStart).toFixed(2)}ms, JSONB=${(jsonbEnd - jsonbStart).toFixed(2)}ms`);
	}
	
	const textAvg3 = textTimes3.reduce((a, b) => a + b, 0) / textTimes3.length;
	const jsonbAvg3 = jsonbTimes3.reduce((a, b) => a + b, 0) / jsonbTimes3.length;
	
	console.log(`\nTEXT average:  ${textAvg3.toFixed(2)}ms`);
	console.log(`JSONB average: ${jsonbAvg3.toFixed(2)}ms`);
	console.log(`Speedup:       ${(textAvg3 / jsonbAvg3).toFixed(2)}x\n`);

	console.log('='.repeat(60));
	console.log('📊 FINAL RESULTS (1M documents, 15 runs each)');
	console.log('='.repeat(60));
	console.log(`Simple query:  TEXT=${textAvg1.toFixed(2)}ms, JSONB=${jsonbAvg1.toFixed(2)}ms (${(textAvg1 / jsonbAvg1).toFixed(2)}x)`);
	console.log(`Complex query: TEXT=${textAvg2.toFixed(2)}ms, JSONB=${jsonbAvg2.toFixed(2)}ms (${(textAvg2 / jsonbAvg2).toFixed(2)}x)`);
	console.log(`Read + parse:  TEXT=${textAvg3.toFixed(2)}ms, JSONB=${jsonbAvg3.toFixed(2)}ms (${(textAvg3 / jsonbAvg3).toFixed(2)}x)`);
	console.log('='.repeat(60) + '\n');

	dbText.close();
	dbJsonb.close();
}

benchmarkTextVsJsonb().catch(console.error);
