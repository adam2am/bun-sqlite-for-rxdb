import { describe, test, expect, afterEach } from 'bun:test';
import { getDatabase, releaseDatabase } from './connection-pool';

describe('Connection Pool', () => {
	afterEach(() => {
		// Clean up any leaked connections
		const leaked = ['testdb1', 'testdb2', 'testdb3'];
		leaked.forEach(name => {
			try { releaseDatabase(name); } catch {}
		});
	});

	test('should share Database object for same databaseName', () => {
		const db1 = getDatabase('testdb1', ':memory:');
		const db2 = getDatabase('testdb1', ':memory:');
		
		expect(db1).toBe(db2); // Same object reference
		
		releaseDatabase('testdb1');
		releaseDatabase('testdb1');
	});

	test('should create separate Database objects for different databaseNames', () => {
		const db1 = getDatabase('testdb1', ':memory:');
		const db2 = getDatabase('testdb2', ':memory:');
		
		expect(db1).not.toBe(db2); // Different objects
		
		releaseDatabase('testdb1');
		releaseDatabase('testdb2');
	});

	test('should throw error when same databaseName used with different filenames', () => {
		getDatabase('testdb1', ':memory:');
		
		expect(() => {
			getDatabase('testdb1', './different.db');
		}).toThrow("Database 'testdb1' already opened with different filename");
		
		releaseDatabase('testdb1');
	});

	test('should increment reference count on multiple getDatabase calls', () => {
		const db1 = getDatabase('testdb1', ':memory:');
		const db2 = getDatabase('testdb1', ':memory:');
		const db3 = getDatabase('testdb1', ':memory:');
		
		expect(db1).toBe(db2);
		expect(db2).toBe(db3);
		
		// Create a table to verify database stays open
		db1.run('CREATE TABLE test (id INTEGER)');
		
		// Release twice - should still be open
		releaseDatabase('testdb1');
		releaseDatabase('testdb1');
		
		// Database should still work
		expect(() => db1.run('INSERT INTO test VALUES (1)')).not.toThrow();
		
		// Final release - now it closes
		releaseDatabase('testdb1');
	});

	test('should close database when reference count reaches zero', () => {
		const db = getDatabase('testdb1', ':memory:');
		db.run('CREATE TABLE test (id INTEGER)');
		
		releaseDatabase('testdb1');
		
		// Database should be closed now
		expect(() => db.run('INSERT INTO test VALUES (1)')).toThrow();
	});

	test('should handle multiple databases independently', () => {
		const db1 = getDatabase('testdb1', ':memory:');
		const db2 = getDatabase('testdb2', ':memory:');
		
		db1.run('CREATE TABLE test1 (id INTEGER)');
		db2.run('CREATE TABLE test2 (id INTEGER)');
		
		// Close db1
		releaseDatabase('testdb1');
		expect(() => db1.run('INSERT INTO test1 VALUES (1)')).toThrow();
		
		// db2 should still work
		expect(() => db2.run('INSERT INTO test2 VALUES (1)')).not.toThrow();
		
		releaseDatabase('testdb2');
	});

	test('should allow reusing databaseName after full release', () => {
		const db1 = getDatabase('testdb1', ':memory:');
		releaseDatabase('testdb1');
		
		// Should be able to get a new database with same name
		const db2 = getDatabase('testdb1', ':memory:');
		expect(db2).not.toBe(db1); // Different instance (old one was closed)
		
		releaseDatabase('testdb1');
	});
});
