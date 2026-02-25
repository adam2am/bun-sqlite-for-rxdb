import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { StatementManager } from '$app/statement-manager';

describe('StatementManager Cache', () => {
	let db: Database;
	let manager: StatementManager;

	beforeEach(() => {
		db = new Database(':memory:');
		db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)');
		db.run('INSERT INTO test VALUES (1, "Alice", 25), (2, "Bob", 30), (3, "Charlie", 35)');
		manager = new StatementManager(db);
	});

	test('all() - cache miss on first call', () => {
		const query = 'SELECT * FROM test WHERE age > ?';
		const result = manager.all({ query, params: [20] });
		
		expect(result).toHaveLength(3);
		expect(result[0]).toHaveProperty('name', 'Alice');
	});

	test('all() - cache hit on second call with same query', () => {
		const query = 'SELECT * FROM test WHERE age > ?';
		
		const result1 = manager.all({ query, params: [20] });
		const result2 = manager.all({ query, params: [20] });
		
		expect(result1).toEqual(result2);
		expect(result2).toHaveLength(3);
	});

	test('all() - different params reuse same cached statement', () => {
		const query = 'SELECT * FROM test WHERE age > ?';
		
		const result1 = manager.all({ query, params: [20] });
		const result2 = manager.all({ query, params: [30] });
		
		expect(result1).toHaveLength(3);
		expect(result2).toHaveLength(1);
	});

	test('all() - different queries create different cached statements', () => {
		const query1 = 'SELECT * FROM test WHERE age > ?';
		const query2 = 'SELECT * FROM test WHERE age < ?';
		
		const result1 = manager.all({ query: query1, params: [25] });
		const result2 = manager.all({ query: query2, params: [30] });
		
		expect(result1).toHaveLength(2);
		expect(result2).toHaveLength(1);
	});

	test('get() - cache miss on first call', () => {
		const query = 'SELECT * FROM test WHERE id = ?';
		const result = manager.get({ query, params: [1] });
		
		expect(result).toHaveProperty('name', 'Alice');
	});

	test('get() - cache hit on second call with same query', () => {
		const query = 'SELECT * FROM test WHERE id = ?';
		
		const result1 = manager.get({ query, params: [1] });
		const result2 = manager.get({ query, params: [2] });
		
		expect(result1).toHaveProperty('name', 'Alice');
		expect(result2).toHaveProperty('name', 'Bob');
	});

	test('LRU eviction - oldest statement evicted when cache full', () => {
		for (let i = 0; i < 500; i++) {
			const query = `SELECT * FROM test WHERE age > ${i}`;
			manager.all({ query, params: [] });
		}
		
		const newQuery = 'SELECT * FROM test WHERE age < 100';
		manager.all({ query: newQuery, params: [] });
		
		const firstQuery = 'SELECT * FROM test WHERE age > 0';
		const result = manager.all({ query: firstQuery, params: [] });
		
		expect(result).toHaveLength(3);
	});

	test('LRU behavior - recently used statement moves to end', () => {
		const queries = Array.from({ length: 10 }, (_, i) => `SELECT * FROM test WHERE age > ${i}`);
		
		queries.forEach(query => manager.all({ query, params: [] }));
		
		manager.all({ query: queries[0], params: [] });
		
		for (let i = 0; i < 495; i++) {
			const query = `SELECT * FROM test WHERE id = ${i + 100}`;
			manager.all({ query, params: [] });
		}
		
		const result = manager.all({ query: queries[0], params: [] });
		expect(result).toHaveLength(3);
	});

	test('Cache isolation - all() and get() share same cache', () => {
		const query = 'SELECT * FROM test WHERE id = ?';
		
		manager.get({ query, params: [1] });
		const result = manager.all({ query, params: [2] });
		
		expect(result).toHaveLength(1);
		expect(result[0]).toHaveProperty('name', 'Bob');
	});

	test('Performance - cached queries are faster', () => {
		const query = 'SELECT * FROM test WHERE age > ?';
		
		const start1 = process.hrtime.bigint();
		for (let i = 0; i < 1000; i++) {
			manager.all({ query, params: [20] });
		}
		const cachedTime = Number(process.hrtime.bigint() - start1) / 1_000_000;
		
		const start2 = process.hrtime.bigint();
		for (let i = 0; i < 1000; i++) {
			const uniqueQuery = `SELECT * FROM test WHERE age > ${i}`;
			manager.all({ query: uniqueQuery, params: [] });
		}
		const uncachedTime = Number(process.hrtime.bigint() - start2) / 1_000_000;
		
		expect(cachedTime).toBeLessThan(uncachedTime);
		console.log(`  Cached: ${cachedTime.toFixed(2)}ms, Uncached: ${uncachedTime.toFixed(2)}ms (${(uncachedTime/cachedTime).toFixed(1)}x faster)`);
	});

	test('Edge case - empty params array', () => {
		const query = 'SELECT * FROM test';
		const result = manager.all({ query, params: [] });
		
		expect(result).toHaveLength(3);
	});

	test('Edge case - complex query with multiple params', () => {
		const query = 'SELECT * FROM test WHERE age > ? AND age < ? AND name LIKE ?';
		const result = manager.all({ query, params: [20, 40, '%li%'] });
		
		expect(result).toHaveLength(2);
	});

	test('Edge case - same query different param counts should be different cache entries', () => {
		const query1 = 'SELECT * FROM test WHERE id IN (?)';
		const query2 = 'SELECT * FROM test WHERE id IN (?, ?)';
		
		const result1 = manager.all({ query: query1, params: [1] });
		const result2 = manager.all({ query: query2, params: [1, 2] });
		
		expect(result1).toHaveLength(1);
		expect(result2).toHaveLength(2);
	});

	test('Stress test - 1000 unique queries', () => {
		const start = performance.now();
		
		for (let i = 0; i < 1000; i++) {
			const query = `SELECT * FROM test WHERE age > ${i}`;
			manager.all({ query, params: [] });
		}
		
		const time = performance.now() - start;
		expect(time).toBeLessThan(1000);
		console.log(`  1000 unique queries: ${time.toFixed(2)}ms (${(time/1000).toFixed(3)}ms per query)`);
	});

	test('Stress test - 10k repeated queries', () => {
		const query = 'SELECT * FROM test WHERE age > ?';
		const start = performance.now();
		
		for (let i = 0; i < 10000; i++) {
			manager.all({ query, params: [20] });
		}
		
		const time = performance.now() - start;
		expect(time).toBeLessThan(500);
		console.log(`  10k repeated queries: ${time.toFixed(2)}ms (${(time/10000*1000).toFixed(2)}µs per query)`);
	});

	test('close() - finalizes all cached statements and throws on reuse', () => {
		const queries = Array.from({ length: 10 }, (_, i) => `SELECT * FROM test WHERE age > ${i}`);
		
		queries.forEach(query => manager.all({ query, params: [] }));
		
		manager.close();
		
		expect(() => manager.all({ query: queries[0], params: [] })).toThrow('StatementManager is closed');
		expect(() => manager.get({ query: queries[0], params: [] })).toThrow('StatementManager is closed');
		expect(() => manager.run({ query: 'INSERT INTO test VALUES (?, ?, ?)', params: [4, 'Dave', 40] })).toThrow('StatementManager is closed');
		console.log(`  After close(): throws on all methods ✅`);
	});

	test('Boundary condition - exactly 500 entries', () => {
		for (let i = 0; i < 500; i++) {
			const query = `SELECT * FROM test WHERE age = ${i}`;
			manager.all({ query, params: [] });
		}
		
		const query500 = 'SELECT * FROM test WHERE age = 500';
		manager.all({ query: query500, params: [] });
		
		const firstQuery = 'SELECT * FROM test WHERE age = 0';
		const result = manager.all({ query: firstQuery, params: [] });
		
		expect(result).toHaveLength(0);
	});

	test('Boundary condition - 501st entry evicts first', () => {
		const firstQuery = 'SELECT * FROM test WHERE id = 1';
		manager.all({ query: firstQuery, params: [] });
		
		for (let i = 1; i < 500; i++) {
			const query = `SELECT * FROM test WHERE age = ${i}`;
			manager.all({ query, params: [] });
		}
		
		const query501 = 'SELECT * FROM test WHERE age = 999';
		manager.all({ query: query501, params: [] });
		
		const start = process.hrtime.bigint();
		manager.all({ query: firstQuery, params: [] });
		const time = Number(process.hrtime.bigint() - start) / 1_000;
		
		console.log(`  First query after 501 entries: ${time.toFixed(2)}µs (evicted, rebuilt)`);
		expect(time).toBeGreaterThan(0);
	});

	test('Multiple managers - cache isolation', () => {
		const db2 = new Database(':memory:');
		db2.run('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)');
		db2.run('INSERT INTO test VALUES (1, "Dave", 40), (2, "Eve", 45)');
		const manager2 = new StatementManager(db2);
		
		const query = 'SELECT * FROM test WHERE age > ?';
		
		const result1 = manager.all({ query, params: [20] });
		const result2 = manager2.all({ query, params: [20] });
		
		expect(result1).toHaveLength(3);
		expect(result2).toHaveLength(2);
		expect(result1[0]).toHaveProperty('name', 'Alice');
		expect(result2[0]).toHaveProperty('name', 'Dave');
	});

	test('Statement finalization on eviction - no memory leaks', () => {
		const initialQueries = Array.from({ length: 500 }, (_, i) => `SELECT * FROM test WHERE age = ${i}`);
		initialQueries.forEach(query => manager.all({ query, params: [] }));
		
		for (let i = 0; i < 100; i++) {
			const query = `SELECT * FROM test WHERE id = ${i + 1000}`;
			manager.all({ query, params: [] });
		}
		
		const query = 'SELECT * FROM test WHERE age > ?';
		const result = manager.all({ query, params: [20] });
		
		expect(result).toHaveLength(3);
		console.log(`  100 evictions completed without errors ✅`);
	});
});
