import { Database } from "bun:sqlite";

interface BenchmarkDocType {
	id: string;
	name: string;
	email: string;
	domain: string;
}

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
			? { sql: `LOWER(${field}) = LOWER(?)`, args: [exact] }
			: { sql: `${field} = ?`, args: [exact] };
	}
	
	if (startsWithAnchor) {
		const prefix = cleanPattern.replace(/\\\./g, '.');
		if (!/[*+?()[\]{}|]/.test(prefix)) {
			const escaped = prefix.replace(/%/g, '\\%').replace(/_/g, '\\_');
			return caseInsensitive
				? { sql: `LOWER(${field}) LIKE LOWER(?) ESCAPE '\\'`, args: [escaped + '%'] }
				: { sql: `${field} LIKE ? ESCAPE '\\'`, args: [escaped + '%'] };
		}
	}
	
	if (endsWithAnchor) {
		const suffix = cleanPattern.replace(/\\\./g, '.');
		if (!/[*+?()[\]{}|]/.test(suffix)) {
			const escaped = suffix.replace(/%/g, '\\%').replace(/_/g, '\\_');
			return caseInsensitive
				? { sql: `LOWER(${field}) LIKE LOWER(?) ESCAPE '\\'`, args: ['%' + escaped] }
				: { sql: `${field} LIKE ? ESCAPE '\\'`, args: ['%' + escaped] };
		}
	}
	
	cleanPattern = cleanPattern.replace(/\\\./g, '.');
	if (!/[*+?()[\]{}|^$]/.test(cleanPattern)) {
		const escaped = cleanPattern.replace(/%/g, '\\%').replace(/_/g, '\\_');
		return caseInsensitive
			? { sql: `LOWER(${field}) LIKE LOWER(?) ESCAPE '\\'`, args: ['%' + escaped + '%'] }
			: { sql: `${field} LIKE ? ESCAPE '\\'`, args: ['%' + escaped + '%'] };
	}
	
	return null;
}

async function benchmarkOldVsNew() {
	console.log('🏴‍☠️ OLD vs NEW Regex: REAL Performance Comparison\n');

	const db = new Database(":memory:");
	
	db.run(`
		CREATE TABLE users (
			id TEXT PRIMARY KEY,
			data TEXT
		)
	`);
	
	db.run(`CREATE INDEX idx_name ON users(json_extract(data, '$.name'))`);
	db.run(`CREATE INDEX idx_email ON users(json_extract(data, '$.email'))`);
	db.run(`CREATE INDEX idx_domain ON users(json_extract(data, '$.domain'))`);

	console.log('📝 Inserting 100,000 documents...');
	const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'company.com'];
	
	const insertStmt = db.prepare('INSERT INTO users (id, data) VALUES (?, ?)');
	const insertMany = db.transaction((docs: any[]) => {
		for (const doc of docs) {
			insertStmt.run(doc.id, JSON.stringify(doc.data));
		}
	});
	
	const allDocs = [];
	for (let i = 0; i < 100000; i++) {
		const domain = domains[i % domains.length];
		allDocs.push({
			id: `user${i}`,
			data: {
				name: `User ${i}`,
				email: `user${i}@${domain}`,
				domain: domain
			}
		});
	}
	insertMany(allDocs);
	console.log('✅ Inserted 100,000 documents\n');

	console.log('='.repeat(60));
	console.log('Test 1: Prefix pattern (^User 1)');
	console.log('='.repeat(60));
	
	const old1 = oldTranslateRegex("json_extract(data, '$.name')", '^User 1');
	const new1 = newTranslateRegex("json_extract(data, '$.name')", '^User 1');
	
	const oldStart1 = performance.now();
	const oldResult1 = db.query(`SELECT * FROM users WHERE ${old1!.sql}`).all(old1!.args);
	const oldEnd1 = performance.now();
	
	const newStart1 = performance.now();
	const newResult1 = db.query(`SELECT * FROM users WHERE ${new1!.sql}`).all(new1!.args);
	const newEnd1 = performance.now();
	
	console.log(`OLD: ${(oldEnd1 - oldStart1).toFixed(2)}ms - ${old1!.sql}`);
	console.log(`NEW: ${(newEnd1 - newStart1).toFixed(2)}ms - ${new1!.sql}`);
	console.log(`Speedup: ${((oldEnd1 - oldStart1) / (newEnd1 - newStart1)).toFixed(2)}x\n`);

	console.log('='.repeat(60));
	console.log('Test 2: Exact match (^gmail.com$)');
	console.log('='.repeat(60));
	
	const old2 = oldTranslateRegex("json_extract(data, '$.domain')", '^gmail\\.com$');
	const new2 = newTranslateRegex("json_extract(data, '$.domain')", '^gmail\\.com$');
	
	const oldStart2 = performance.now();
	const oldResult2 = db.query(`SELECT * FROM users WHERE ${old2!.sql}`).all(old2!.args);
	const oldEnd2 = performance.now();
	
	const newStart2 = performance.now();
	const newResult2 = db.query(`SELECT * FROM users WHERE ${new2!.sql}`).all(new2!.args);
	const newEnd2 = performance.now();
	
	console.log(`OLD: ${(oldEnd2 - oldStart2).toFixed(2)}ms - ${old2!.sql}`);
	console.log(`NEW: ${(newEnd2 - newStart2).toFixed(2)}ms - ${new2!.sql}`);
	console.log(`Speedup: ${((oldEnd2 - oldStart2) / (newEnd2 - newStart2)).toFixed(2)}x\n`);

	console.log('='.repeat(60));
	console.log('Test 3: Suffix pattern (@gmail.com$)');
	console.log('='.repeat(60));
	
	const old3 = oldTranslateRegex("json_extract(data, '$.email')", '@gmail\\.com$');
	const new3 = newTranslateRegex("json_extract(data, '$.email')", '@gmail\\.com$');
	
	const oldStart3 = performance.now();
	const oldResult3 = db.query(`SELECT * FROM users WHERE ${old3!.sql}`).all(old3!.args);
	const oldEnd3 = performance.now();
	
	const newStart3 = performance.now();
	const newResult3 = db.query(`SELECT * FROM users WHERE ${new3!.sql}`).all(new3!.args);
	const newEnd3 = performance.now();
	
	console.log(`OLD: ${(oldEnd3 - oldStart3).toFixed(2)}ms - ${old3!.sql}`);
	console.log(`NEW: ${(newEnd3 - newStart3).toFixed(2)}ms - ${new3!.sql}`);
	console.log(`Speedup: ${((oldEnd3 - oldStart3) / (newEnd3 - newStart3)).toFixed(2)}x\n`);

	console.log('='.repeat(60));
	console.log('Test 4: Case-insensitive (user, i flag)');
	console.log('='.repeat(60));
	
	const old4 = oldTranslateRegex("json_extract(data, '$.name')", 'user', 'i');
	const new4 = newTranslateRegex("json_extract(data, '$.name')", 'user', 'i');
	
	const oldStart4 = performance.now();
	const oldResult4 = db.query(`SELECT * FROM users WHERE ${old4!.sql}`).all(old4!.args);
	const oldEnd4 = performance.now();
	
	const newStart4 = performance.now();
	const newResult4 = db.query(`SELECT * FROM users WHERE ${new4!.sql}`).all(new4!.args);
	const newEnd4 = performance.now();
	
	console.log(`OLD: ${(oldEnd4 - oldStart4).toFixed(2)}ms - ${old4!.sql}`);
	console.log(`NEW: ${(newEnd4 - newStart4).toFixed(2)}ms - ${new4!.sql}`);
	console.log(`Speedup: ${((oldEnd4 - oldStart4) / (newEnd4 - newStart4)).toFixed(2)}x\n`);

	const oldAvg = ((oldEnd1 - oldStart1) + (oldEnd2 - oldStart2) + (oldEnd3 - oldStart3) + (oldEnd4 - oldStart4)) / 4;
	const newAvg = ((newEnd1 - newStart1) + (newEnd2 - newStart2) + (newEnd3 - newStart3) + (newEnd4 - newStart4)) / 4;

	console.log('='.repeat(60));
	console.log('📊 FINAL RESULTS (100k documents)');
	console.log('='.repeat(60));
	console.log(`OLD average: ${oldAvg.toFixed(2)}ms`);
	console.log(`NEW average: ${newAvg.toFixed(2)}ms`);
	console.log(`Overall speedup: ${(oldAvg / newAvg).toFixed(2)}x faster`);
	console.log('='.repeat(60) + '\n');

	db.close();
}

benchmarkOldVsNew().catch(console.error);
