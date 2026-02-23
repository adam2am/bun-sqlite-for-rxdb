import Database from "better-sqlite3";

console.log("🏴‍☠️ better-sqlite3 Raw Performance Benchmark\n");

const db = new Database(":memory:");

// Enable WAL mode + optimize for speed
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = 1");

// Create table
db.exec(`
  CREATE TABLE docs (
    id TEXT PRIMARY KEY,
    name TEXT,
    age INTEGER,
    email TEXT,
    status TEXT
  )
`);

db.exec(`CREATE INDEX idx_age ON docs(age)`);
db.exec(`CREATE INDEX idx_status ON docs(status)`);

console.log("📊 Test 1: Bulk INSERT (10,000 docs)");
const insertStmt = db.prepare("INSERT INTO docs (id, name, age, email, status) VALUES (?, ?, ?, ?, ?)");
const insertMany = db.transaction((docs: Array<{ id: string; name: string; age: number; email: string; status: string }>) => {
  for (const doc of docs) {
    insertStmt.run(doc.id, doc.name, doc.age, doc.email, doc.status);
  }
});

const docs = [];
for (let i = 0; i < 10000; i++) {
  docs.push({
    id: `doc${i}`,
    name: `User ${i}`,
    age: 18 + (i % 50),
    email: `user${i}@example.com`,
    status: i % 2 === 0 ? "active" : "inactive"
  });
}

const insertStart = performance.now();
insertMany(docs);
const insertEnd = performance.now();
const insertTime = insertEnd - insertStart;
console.log(`  Time: ${insertTime.toFixed(2)}ms`);
console.log(`  Throughput: ${(10000 / (insertTime / 1000)).toFixed(0)} docs/sec\n`);

console.log("📊 Test 2: SELECT by ID (1,000 lookups)");
const selectStmt = db.prepare("SELECT * FROM docs WHERE id = ?");
const selectStart = performance.now();
for (let i = 0; i < 1000; i++) {
  selectStmt.get(`doc${i}`);
}
const selectEnd = performance.now();
const selectTime = selectEnd - selectStart;
console.log(`  Time: ${selectTime.toFixed(2)}ms`);
console.log(`  Throughput: ${(1000 / (selectTime / 1000)).toFixed(0)} docs/sec\n`);

console.log("📊 Test 3: SELECT with WHERE (indexed)");
const whereStmt = db.prepare("SELECT * FROM docs WHERE age > ? AND status = ?");
const whereStart = performance.now();
const results = whereStmt.all(30, "active");
const whereEnd = performance.now();
const whereTime = whereEnd - whereStart;
console.log(`  Found: ${results.length} docs`);
console.log(`  Time: ${whereTime.toFixed(2)}ms\n`);

console.log("📊 Test 4: Complex query (no index)");
const complexStmt = db.prepare("SELECT * FROM docs WHERE name LIKE ? ORDER BY age DESC LIMIT 100");
const complexStart = performance.now();
const complexResults = complexStmt.all("%User 1%");
const complexEnd = performance.now();
const complexTime = complexEnd - complexStart;
console.log(`  Found: ${complexResults.length} docs`);
console.log(`  Time: ${complexTime.toFixed(2)}ms\n`);

console.log("✅ Summary:");
console.log(`  INSERT: ${insertTime.toFixed(2)}ms (${(10000 / (insertTime / 1000)).toFixed(0)} docs/sec)`);
console.log(`  SELECT by ID: ${selectTime.toFixed(2)}ms (${(1000 / (selectTime / 1000)).toFixed(0)} docs/sec)`);
console.log(`  WHERE indexed: ${whereTime.toFixed(2)}ms`);
console.log(`  Complex query: ${complexTime.toFixed(2)}ms`);

db.close();
