import { Database } from "bun:sqlite";

async function benchmarkFTS5() {
	console.log('🏴‍☠️ FTS5 Trigram Indexes: BEFORE vs AFTER\n');

	const db = new Database(":memory:");
	
	db.run(`CREATE TABLE users (id TEXT PRIMARY KEY, data TEXT)`);
	db.run(`CREATE INDEX idx_name ON users(json_extract(data, '$.name'))`);
	db.run(`CREATE INDEX idx_email ON users(json_extract(data, '$.email'))`);

	console.log('📝 Inserting 100,000 documents...');
	const insertStmt = db.prepare('INSERT INTO users (id, data) VALUES (?, ?)');
	const insertMany = db.transaction((docs: Array<{ id: string; data: any }>) => {
		for (const doc of docs) {
			insertStmt.run(doc.id, JSON.stringify(doc.data));
		}
	});
	
	const allDocs: Array<{ id: string; data: any }> = [];
	for (let i = 0; i < 100000; i++) {
		allDocs.push({
			id: `user${i}`,
			data: { 
				name: `User ${i}`,
				email: `user${i}@example.com`,
				bio: `This is a biography for user ${i} with some random text about their interests and hobbies.`
			}
		});
	}
	insertMany(allDocs);
	console.log('✅ Inserted 100,000 documents\n');

	console.log('='.repeat(60));
	console.log('BEFORE FTS5: Substring search with LIKE');
	console.log('='.repeat(60));
	
	const beforeTimes: number[] = [];
	
	for (let run = 1; run <= 10; run++) {
		const start = performance.now();
		db.query(`SELECT * FROM users WHERE json_extract(data, '$.bio') LIKE ? ESCAPE '\\'`).all('%biography%');
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
	
	db.run(`CREATE VIRTUAL TABLE users_fts USING fts5(id, name, email, bio, tokenize='trigram')`);
	
	const ftsInsertStmt = db.prepare('INSERT INTO users_fts (id, name, email, bio) VALUES (?, ?, ?, ?)');
	const ftsInsertMany = db.transaction((docs: Array<{ id: string; data: any }>) => {
		for (const doc of docs) {
			ftsInsertStmt.run(doc.id, doc.data.name, doc.data.email, doc.data.bio);
		}
	});
	ftsInsertMany(allDocs);
	console.log('✅ FTS5 index created\n');

	console.log('='.repeat(60));
	console.log('AFTER FTS5: Substring search with FTS5');
	console.log('='.repeat(60));
	
	const afterTimes: number[] = [];
	
	for (let run = 1; run <= 10; run++) {
		const start = performance.now();
		db.query(`SELECT * FROM users_fts WHERE bio MATCH ?`).all('biography');
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
	console.log('📊 FINAL RESULTS (10 runs each)');
	console.log('='.repeat(60));
	console.log(`BEFORE (LIKE):  ${beforeAvg.toFixed(2)}ms average`);
	console.log(`AFTER (FTS5):   ${afterAvg.toFixed(2)}ms average`);
	console.log(`Speedup:        ${(beforeAvg / afterAvg).toFixed(2)}x`);
	console.log('='.repeat(60) + '\n');

	db.close();
}

benchmarkFTS5().catch(console.error);
