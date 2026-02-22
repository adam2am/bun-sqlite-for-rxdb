import { Database } from "bun:sqlite";

function oldTranslateRegex(field: string, pattern: string, options?: string): { sql: string; args: string[] } | null {
	const caseInsensitive = options?.includes('i');
	
	const startsWithAnchor = pattern.startsWith('^');
	const endsWithAnchor = pattern.endsWith('$');
	
	let cleanPattern = pattern.replace(/^\^/, '').replace(/\$$/, '');
	
	const isSimple = /^[\w\s\-@.\\]+$/.test(cleanPattern);
	if (!isSimple) return null;
	
	cleanPattern = cleanPattern.replace(/\\\./g, '.');
	cleanPattern = cleanPattern.replace(/%/g, '\\%').replace(/_/g, '\\_');
	
	let likePattern = cleanPattern;
	if (!startsWithAnchor) likePattern = '%' + likePattern;
	if (!endsWithAnchor) likePattern = likePattern + '%';
	
	const collation = caseInsensitive ? ' COLLATE NOCASE' : '';
	
	return { 
		sql: `${field} LIKE ?${collation} ESCAPE '\\'`, 
		args: [likePattern] 
	};
}

function newTranslateRegex(field: string, pattern: string, options?: string): { sql: string; args: string[] } | null {
	const caseInsensitive = options?.includes('i');
	
	const startsWithAnchor = pattern.startsWith('^');
	const endsWithAnchor = pattern.endsWith('$');
	
	let cleanPattern = pattern.replace(/^\^/, '').replace(/\$$/, '');
	
	if (startsWithAnchor && endsWithAnchor && !/[*+?()[\]{}|]/.test(cleanPattern)) {
		const exact = cleanPattern.replace(/\\\./g, '.');
		return caseInsensitive
			? { sql: `${field} COLLATE NOCASE = ?`, args: [exact] }
			: { sql: `${field} = ?`, args: [exact] };
	}
	
	if (startsWithAnchor) {
		const prefix = cleanPattern.replace(/\\\./g, '.');
		if (!/[*+?()[\]{}|]/.test(prefix)) {
			const escaped = prefix.replace(/%/g, '\\%').replace(/_/g, '\\_');
			const collation = caseInsensitive ? ' COLLATE NOCASE' : '';
			return { sql: `${field} LIKE ?${collation} ESCAPE '\\'`, args: [escaped + '%'] };
		}
	}
	
	if (endsWithAnchor) {
		const suffix = cleanPattern.replace(/\\\./g, '.');
		if (!/[*+?()[\]{}|]/.test(suffix)) {
			const escaped = suffix.replace(/%/g, '\\%').replace(/_/g, '\\_');
			const collation = caseInsensitive ? ' COLLATE NOCASE' : '';
			return { sql: `${field} LIKE ?${collation} ESCAPE '\\'`, args: ['%' + escaped] };
		}
	}
	
	cleanPattern = cleanPattern.replace(/\\\./g, '.');
	if (!/[*+?()[\]{}|^$]/.test(cleanPattern)) {
		const escaped = cleanPattern.replace(/%/g, '\\%').replace(/_/g, '\\_');
		const collation = caseInsensitive ? ' COLLATE NOCASE' : '';
		return { sql: `${field} LIKE ?${collation} ESCAPE '\\'`, args: ['%' + escaped + '%'] };
	}
	
	return null;
}

async function benchmark10Runs() {
	console.log('🏴‍☠️ Regex Optimization: 10 Runs for Prefix/Exact/Suffix\n');

	const db = new Database(":memory:");
	
	db.run(`CREATE TABLE users (id TEXT PRIMARY KEY, data TEXT)`);
	db.run(`CREATE INDEX idx_name ON users(json_extract(data, '$.name'))`);
	db.run(`CREATE INDEX idx_domain ON users(json_extract(data, '$.domain'))`);
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
				domain: 'gmail.com',
				email: `user${i}@gmail.com`
			}
		});
	}
	insertMany(allDocs);
	console.log('✅ Inserted 100,000 documents\n');

	// Test 1: Prefix pattern
	console.log('='.repeat(60));
	console.log('Test 1: Prefix pattern (^User 1)');
	console.log('='.repeat(60));
	
	const prefixOldTimes: number[] = [];
	const prefixNewTimes: number[] = [];
	
	for (let run = 1; run <= 10; run++) {
		const old = oldTranslateRegex("json_extract(data, '$.name')", '^User 1');
		const newQ = newTranslateRegex("json_extract(data, '$.name')", '^User 1');
		
		const oldStart = performance.now();
		db.query(`SELECT * FROM users WHERE ${old!.sql}`).all(...old!.args);
		const oldEnd = performance.now();
		prefixOldTimes.push(oldEnd - oldStart);
		
		const newStart = performance.now();
		db.query(`SELECT * FROM users WHERE ${newQ!.sql}`).all(...newQ!.args);
		const newEnd = performance.now();
		prefixNewTimes.push(newEnd - newStart);
		
		console.log(`Run ${run}: OLD=${(oldEnd - oldStart).toFixed(2)}ms, NEW=${(newEnd - newStart).toFixed(2)}ms`);
	}
	
	const prefixOldAvg = prefixOldTimes.reduce((a, b) => a + b, 0) / prefixOldTimes.length;
	const prefixNewAvg = prefixNewTimes.reduce((a, b) => a + b, 0) / prefixNewTimes.length;
	
	console.log(`\nOLD average: ${prefixOldAvg.toFixed(2)}ms`);
	console.log(`NEW average: ${prefixNewAvg.toFixed(2)}ms`);
	console.log(`Speedup: ${(prefixOldAvg / prefixNewAvg).toFixed(2)}x\n`);

	// Test 2: Exact match
	console.log('='.repeat(60));
	console.log('Test 2: Exact match (^gmail.com$)');
	console.log('='.repeat(60));
	
	const exactOldTimes: number[] = [];
	const exactNewTimes: number[] = [];
	
	for (let run = 1; run <= 10; run++) {
		const old = oldTranslateRegex("json_extract(data, '$.domain')", '^gmail\\.com$');
		const newQ = newTranslateRegex("json_extract(data, '$.domain')", '^gmail\\.com$');
		
		const oldStart = performance.now();
		db.query(`SELECT * FROM users WHERE ${old!.sql}`).all(...old!.args);
		const oldEnd = performance.now();
		exactOldTimes.push(oldEnd - oldStart);
		
		const newStart = performance.now();
		db.query(`SELECT * FROM users WHERE ${newQ!.sql}`).all(...newQ!.args);
		const newEnd = performance.now();
		exactNewTimes.push(newEnd - newStart);
		
		console.log(`Run ${run}: OLD=${(oldEnd - oldStart).toFixed(2)}ms, NEW=${(newEnd - newStart).toFixed(2)}ms`);
	}
	
	const exactOldAvg = exactOldTimes.reduce((a, b) => a + b, 0) / exactOldTimes.length;
	const exactNewAvg = exactNewTimes.reduce((a, b) => a + b, 0) / exactNewTimes.length;
	
	console.log(`\nOLD average: ${exactOldAvg.toFixed(2)}ms`);
	console.log(`NEW average: ${exactNewAvg.toFixed(2)}ms`);
	console.log(`Speedup: ${(exactOldAvg / exactNewAvg).toFixed(2)}x\n`);

	// Test 3: Suffix pattern
	console.log('='.repeat(60));
	console.log('Test 3: Suffix pattern (@gmail.com$)');
	console.log('='.repeat(60));
	
	const suffixOldTimes: number[] = [];
	const suffixNewTimes: number[] = [];
	
	for (let run = 1; run <= 10; run++) {
		const old = oldTranslateRegex("json_extract(data, '$.email')", '@gmail\\.com$');
		const newQ = newTranslateRegex("json_extract(data, '$.email')", '@gmail\\.com$');
		
		const oldStart = performance.now();
		db.query(`SELECT * FROM users WHERE ${old!.sql}`).all(...old!.args);
		const oldEnd = performance.now();
		suffixOldTimes.push(oldEnd - oldStart);
		
		const newStart = performance.now();
		db.query(`SELECT * FROM users WHERE ${newQ!.sql}`).all(...newQ!.args);
		const newEnd = performance.now();
		suffixNewTimes.push(newEnd - newStart);
		
		console.log(`Run ${run}: OLD=${(oldEnd - oldStart).toFixed(2)}ms, NEW=${(newEnd - newStart).toFixed(2)}ms`);
	}
	
	const suffixOldAvg = suffixOldTimes.reduce((a, b) => a + b, 0) / suffixOldTimes.length;
	const suffixNewAvg = suffixNewTimes.reduce((a, b) => a + b, 0) / suffixNewTimes.length;
	
	console.log(`\nOLD average: ${suffixOldAvg.toFixed(2)}ms`);
	console.log(`NEW average: ${suffixNewAvg.toFixed(2)}ms`);
	console.log(`Speedup: ${(suffixOldAvg / suffixNewAvg).toFixed(2)}x\n`);

	// Final summary
	console.log('='.repeat(60));
	console.log('📊 FINAL SUMMARY (10 runs each)');
	console.log('='.repeat(60));
	console.log(`Prefix (^User 1):        ${(prefixOldAvg / prefixNewAvg).toFixed(2)}x speedup`);
	console.log(`Exact (^gmail.com$):     ${(exactOldAvg / exactNewAvg).toFixed(2)}x speedup`);
	console.log(`Suffix (@gmail.com$):    ${(suffixOldAvg / suffixNewAvg).toFixed(2)}x speedup`);
	
	const overallOldAvg = (prefixOldAvg + exactOldAvg + suffixOldAvg) / 3;
	const overallNewAvg = (prefixNewAvg + exactNewAvg + suffixNewAvg) / 3;
	console.log(`\nOverall average speedup: ${(overallOldAvg / overallNewAvg).toFixed(2)}x`);
	console.log('='.repeat(60) + '\n');

	db.close();
}

benchmark10Runs().catch(console.error);
