import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { sqliteTransaction } from '$app/transaction-queue';

describe('Transaction Queue', () => {
	let db: Database;

	beforeEach(() => {
		db = new Database(':memory:');
		db.run('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
	});

	test('executes transaction successfully', async () => {
		const result = await sqliteTransaction(db, async () => {
			db.run('INSERT INTO test VALUES (1, "hello")');
			return 'success';
		});

		expect(result).toBe('success');
		const row = db.query('SELECT * FROM test WHERE id = 1').get() as { id: number; value: string };
		expect(row.value).toBe('hello');
	});

	test('rolls back on error', async () => {
		try {
			await sqliteTransaction(db, async () => {
				db.run('INSERT INTO test VALUES (1, "hello")');
				throw new Error('Test error');
			});
		} catch (err) {
			expect((err as Error).message).toBe('Test error');
		}

		const rows = db.query('SELECT * FROM test').all();
		expect(rows).toHaveLength(0);
	});

	test('serializes concurrent writes', async () => {
		const results: number[] = [];

		const write1 = sqliteTransaction(db, async () => {
			db.run('INSERT INTO test VALUES (1, "first")');
			await new Promise(resolve => setTimeout(resolve, 10));
			results.push(1);
		});

		const write2 = sqliteTransaction(db, async () => {
			db.run('INSERT INTO test VALUES (2, "second")');
			results.push(2);
		});

		await Promise.all([write1, write2]);

		expect(results).toEqual([1, 2]);
		const rows = db.query('SELECT * FROM test ORDER BY id').all();
		expect(rows).toHaveLength(2);
	});

	test('handles multiple concurrent transactions', async () => {
		const promises = Array.from({ length: 10 }, (_, i) =>
			sqliteTransaction(db, async () => {
				db.run(`INSERT INTO test VALUES (${i}, "value${i}")`);
			})
		);

		await Promise.all(promises);

		const rows = db.query('SELECT * FROM test').all();
		expect(rows).toHaveLength(10);
	});

	test('returns handler result', async () => {
		const result = await sqliteTransaction(db, async () => {
			db.run('INSERT INTO test VALUES (1, "hello")');
			return { success: true, count: 1 };
		});

		expect(result).toEqual({ success: true, count: 1 });
	});

	test('preserves error details', async () => {
		const customError = new Error('Custom error');
		(customError as any).code = 'CUSTOM_CODE';

		try {
			await sqliteTransaction(db, async () => {
				throw customError;
			});
		} catch (err) {
			expect((err as Error).message).toBe('Custom error');
			expect((err as any).code).toBe('CUSTOM_CODE');
		}
	});

	test('prevents race condition in concurrent writes', async () => {
		db.run('INSERT INTO test VALUES (1, "initial")');

		const update1 = sqliteTransaction(db, async () => {
			const row = db.query('SELECT value FROM test WHERE id = 1').get() as { value: string };
			await new Promise(resolve => setTimeout(resolve, 5));
			db.run(`UPDATE test SET value = "${row.value}-updated1" WHERE id = 1`);
		});

		const update2 = sqliteTransaction(db, async () => {
			const row = db.query('SELECT value FROM test WHERE id = 1').get() as { value: string };
			await new Promise(resolve => setTimeout(resolve, 5));
			db.run(`UPDATE test SET value = "${row.value}-updated2" WHERE id = 1`);
		});

		await Promise.all([update1, update2]);

		const final = db.query('SELECT value FROM test WHERE id = 1').get() as { value: string };
		expect(final.value).toBe('initial-updated1-updated2');
	});
});
