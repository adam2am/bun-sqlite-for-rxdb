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

async function benchmark10Runs() {
	console.log('🏴‍☠️ Case-Insensitive Performance: 10 Runs\n');

	const db = new Database(":memory:");
	
	db.run(`CREATE TABLE users (id TEXT PRIMARY KEY, data TEXT)`);
	db.run(`CREATE INDEX idx_name ON users(json_extract(data, '$.name'))`);

	console.log('📝 Inserting 100,000 documents...');
	const insertStmt = db.prepare('INSERT INTO users (id, data) VALUES (?, ?)');
	const insertMany = db.transaction((docs: any[]) => {
		for (const doc of docs) {
			insertStmt.run(doc.id, JSON.stringify(doc.data));
		}
	});
	
	const allDocs = [];
	for (let i = 0; i < 100000; i++) {
		allDocs.push({
			id: `user${i}`,
			data: { name: `User ${i}` }
		});
	}
	insertMany(allDocs);
	console.log('✅ Inserted 100,000 documents\n');

	const oldTimes = [];
	const newTimes = [];

	console.log('Running 10 iterations...\n');

	for (let run = 1; run <= 10; run++) {
		const old = oldTranslateRegex("json_extract(data, '$.name')", 'user', 'i');
		const newQ = newTranslateRegex("json_extract(data, '$.name')", 'user', 'i');
		
		const oldStart = performance.now();
		db.query(`SELECT * FROM users WHERE ${old!.sql}`).all(...old!.args);
		const oldEnd = performance.now();
		oldTimes.push(oldEnd - oldStart);
		
		const newStart = performance.now();
		db.query(`SELECT * FROM users WHERE ${newQ!.sql}`).all(...newQ!.args);
		const newEnd = performance.now();
		newTimes.push(newEnd - newStart);
		
		console.log(`Run ${run}: OLD=${(oldEnd - oldStart).toFixed(2)}ms, NEW=${(newEnd - newStart).toFixed(2)}ms`);
	}

	const oldAvg = oldTimes.reduce((a, b) => a + b, 0) / oldTimes.length;
	const newAvg = newTimes.reduce((a, b) => a + b, 0) / newTimes.length;
	const oldMin = Math.min(...oldTimes);
	const oldMax = Math.max(...oldTimes);
	const newMin = Math.min(...newTimes);
	const newMax = Math.max(...newTimes);

	console.log('\n' + '='.repeat(60));
	console.log('📊 STATISTICS (10 runs)');
	console.log('='.repeat(60));
	console.log(`OLD (COLLATE NOCASE):`);
	console.log(`  Average: ${oldAvg.toFixed(2)}ms`);
	console.log(`  Min:     ${oldMin.toFixed(2)}ms`);
	console.log(`  Max:     ${oldMax.toFixed(2)}ms`);
	console.log();
	console.log(`NEW (LOWER()):`);
	console.log(`  Average: ${newAvg.toFixed(2)}ms`);
	console.log(`  Min:     ${newMin.toFixed(2)}ms`);
	console.log(`  Max:     ${newMax.toFixed(2)}ms`);
	console.log();
	console.log(`Speedup: ${(oldAvg / newAvg).toFixed(2)}x`);
	console.log('='.repeat(60));
	
	if (oldAvg < newAvg) {
		console.log('\n❌ VERDICT: OLD is faster - REVERT case-insensitive to COLLATE NOCASE');
	} else {
		console.log('\n✅ VERDICT: NEW is faster - KEEP LOWER()');
	}
	console.log('='.repeat(60) + '\n');

	db.close();
}

benchmark10Runs().catch(console.error);
