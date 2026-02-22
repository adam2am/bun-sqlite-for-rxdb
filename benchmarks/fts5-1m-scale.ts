import { Database } from "bun:sqlite";

async function benchmark1M() {
	console.log('🏴‍☠️ FTS5 Trigram: 1M Scale Benchmark\n');

	const db = new Database(":memory:");
	
	db.run(`CREATE TABLE users (id TEXT PRIMARY KEY, data TEXT)`);
	db.run(`CREATE INDEX idx_bio ON users(json_extract(data, '$.bio'))`);

	console.log('📝 Inserting 1,000,000 documents...');
	const insertStmt = db.prepare('INSERT INTO users (id, data) VALUES (?, ?)');
	const insertMany = db.transaction((docs: Array<{ id: string; data: any }>) => {
		for (const doc of docs) {
			insertStmt.run(doc.id, JSON.stringify(doc.data));
		}
	});
	
	const batchSize = 10000;
	for (let batch = 0; batch < 100; batch++) {
		const docs: Array<{ id: string; data: any }> = [];
		for (let i = 0; i < batchSize; i++) {
			const id = batch * batchSize + i;
			docs.push({
				id: `user${id}`,
				data: { 
					name: `User ${id}`,
					email: `user${id}@example.com`,
					bio: `Biography for user ${id} with interests in technology, music, and travel.`
				}
			});
		}
		insertMany(docs);
		if ((batch + 1) % 10 === 0) {
			console.log(`  Inserted ${(batch + 1) * batchSize} documents...`);
		}
	}
	console.log('✅ Inserted 1,000,000 documents\n');

	console.log('='.repeat(60));
	console.log('BEFORE FTS5: Substring search with LIKE');
	console.log('='.repeat(60));
	
	const beforeTimes: number[] = [];
	
	for (let run = 1; run <= 10; run++) {
		const start = performance.now();
		db.query(`SELECT * FROM users WHERE json_extract(data, '$.bio') LIKE ? ESCAPE '\\'`).all('%technology%');
		const end = performance.now();
		beforeTimes.push(end - start);
		console.log(`Run ${run}: ${(end - start).toFixed(2)}ms`);
	}
	
	const beforeAvg = beforeTimes.reduce((a, b) => a + b, 0) / beforeTimes.length;
	const beforeMin = Math.min(...beforeTimes);
	const beforeMax = Math.max(...beforeTimes);
	
	console.log(`\nBEFORE average: ${beforeAvg.toFixed(2)}ms`);
	console.log(`BEFORE min:     ${beforeMin.toFixed(2)}ms`);
	console.log(`BEFORE max:     ${beforeMax.toFixed(2)}ms\n`);

	console.log('='.repeat(60));
	console.log('Creating FTS5 trigram index...');
	console.log('='.repeat(60));
	
	const ftsStart = performance.now();
	db.run(`CREATE VIRTUAL TABLE users_fts USING fts5(id, bio, tokenize='trigram')`);
	
	const ftsInsertStmt = db.prepare('INSERT INTO users_fts (id, bio) VALUES (?, ?)');
	const ftsInsertMany = db.transaction((docs: Array<{ id: string; data: any }>) => {
		for (const doc of docs) {
			ftsInsertStmt.run(doc.id, doc.data.bio);
		}
	});
	
	for (let batch = 0; batch < 100; batch++) {
		const docs: Array<{ id: string; data: any }> = [];
		for (let i = 0; i < batchSize; i++) {
			const id = batch * batchSize + i;
			docs.push({
				id: `user${id}`,
				data: { 
					bio: `Biography for user ${id} with interests in technology, music, and travel.`
				}
			});
		}
		ftsInsertMany(docs);
	}
	const ftsEnd = performance.now();
	console.log(`✅ FTS5 index created in ${(ftsEnd - ftsStart).toFixed(2)}ms\n`);

	console.log('='.repeat(60));
	console.log('AFTER FTS5: Substring search with FTS5');
	console.log('='.repeat(60));
	
	const afterTimes: number[] = [];
	
	for (let run = 1; run <= 10; run++) {
		const start = performance.now();
		db.query(`SELECT * FROM users_fts WHERE bio MATCH ?`).all('technology');
		const end = performance.now();
		afterTimes.push(end - start);
		console.log(`Run ${run}: ${(end - start).toFixed(2)}ms`);
	}
	
	const afterAvg = afterTimes.reduce((a, b) => a + b, 0) / afterTimes.length;
	const afterMin = Math.min(...afterTimes);
	const afterMax = Math.max(...afterTimes);
	
	console.log(`\nAFTER average: ${afterAvg.toFixed(2)}ms`);
	console.log(`AFTER min:     ${afterMin.toFixed(2)}ms`);
	console.log(`AFTER max:     ${afterMax.toFixed(2)}ms\n`);

	console.log('='.repeat(60));
	console.log('📊 FINAL RESULTS (1M documents, 10 runs each)');
	console.log('='.repeat(60));
	console.log(`BEFORE (LIKE):  ${beforeAvg.toFixed(2)}ms average`);
	console.log(`AFTER (FTS5):   ${afterAvg.toFixed(2)}ms average`);
	console.log(`Speedup:        ${(beforeAvg / afterAvg).toFixed(2)}x`);
	console.log(`Index creation: ${(ftsEnd - ftsStart).toFixed(2)}ms`);
	console.log('='.repeat(60) + '\n');

	db.close();
}

benchmark1M().catch(console.error);
