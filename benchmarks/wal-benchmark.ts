import { Database } from 'bun:sqlite';

console.log('🏴‍☠️ WAL Mode Performance Benchmark\n');

const NUM_DOCS = 1000;
const NUM_RUNS = 5;

interface TestDoc {
	id: string;
	name: string;
	age: number;
	status: string;
	timestamp: number;
}

function createDatabase(name: string, enableWAL: boolean): Database {
	const db = new Database(name);
	
	if (enableWAL) {
		db.run('PRAGMA journal_mode = WAL');
	} else {
		db.run('PRAGMA journal_mode = DELETE');
	}
	
	db.run(`
		CREATE TABLE IF NOT EXISTS documents (
			id TEXT PRIMARY KEY NOT NULL,
			data TEXT NOT NULL,
			deleted INTEGER NOT NULL DEFAULT 0,
			rev TEXT NOT NULL,
			mtime_ms REAL NOT NULL
		)
	`);
	
	return db;
}

function generateDocs(count: number): TestDoc[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `doc-${i}`,
		name: `User ${i}`,
		age: 20 + (i % 50),
		status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'inactive' : 'pending',
		timestamp: Date.now() + i
	}));
}

function benchmarkWrites(db: Database, docs: TestDoc[]): number {
	const start = performance.now();
	
	const stmt = db.prepare(`
		INSERT INTO documents (id, data, deleted, rev, mtime_ms)
		VALUES (?, ?, ?, ?, ?)
	`);
	
	for (const doc of docs) {
		const data = JSON.stringify(doc);
		stmt.run(doc.id, data, 0, '1-abc', doc.timestamp);
	}
	
	const end = performance.now();
	return end - start;
}

async function runBenchmark() {
	const docs = generateDocs(NUM_DOCS);
	const walTimes: number[] = [];
	const noWalTimes: number[] = [];
	
	console.log(`📊 Testing ${NUM_DOCS} document inserts, ${NUM_RUNS} runs each\n`);
	
	console.log('⏱️  Testing WITHOUT WAL (DELETE journal mode)...');
	for (let i = 0; i < NUM_RUNS; i++) {
		const db = createDatabase(':memory:', false);
		const time = benchmarkWrites(db, docs);
		noWalTimes.push(time);
		db.close();
		console.log(`   Run ${i + 1}: ${time.toFixed(2)}ms`);
	}
	
	const avgNoWal = noWalTimes.reduce((a, b) => a + b, 0) / NUM_RUNS;
	console.log(`   Average: ${avgNoWal.toFixed(2)}ms\n`);
	
	console.log('⏱️  Testing WITH WAL mode...');
	for (let i = 0; i < NUM_RUNS; i++) {
		const db = createDatabase(':memory:', true);
		const time = benchmarkWrites(db, docs);
		walTimes.push(time);
		db.close();
		console.log(`   Run ${i + 1}: ${time.toFixed(2)}ms`);
	}
	
	const avgWal = walTimes.reduce((a, b) => a + b, 0) / NUM_RUNS;
	console.log(`   Average: ${avgWal.toFixed(2)}ms\n`);
	
	const speedup = avgNoWal / avgWal;
	console.log('📈 Results:');
	console.log(`   WITHOUT WAL: ${avgNoWal.toFixed(2)}ms`);
	console.log(`   WITH WAL:    ${avgWal.toFixed(2)}ms`);
	console.log(`   Speedup:     ${speedup.toFixed(2)}x faster with WAL\n`);
	
	if (speedup >= 3.0) {
		console.log('✅ WAL mode delivers 3-6x speedup as claimed!\n');
	} else if (speedup >= 1.5) {
		console.log('⚠️  WAL mode is faster, but less than 3x speedup (in-memory DB limitation)\n');
		console.log('💡 Note: WAL benefits are more pronounced with file-based databases\n');
	} else {
		console.log('❌ WAL mode speedup not significant\n');
	}
}

runBenchmark();
