import { describe, test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { translateRegex } from "./operators";
import type { RxJsonSchema, RxDocumentData } from 'rxdb';

const mockSchema: RxJsonSchema<RxDocumentData<{ id: string; name: string }>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', 'name', '_deleted', '_attachments', '_rev', '_meta']
};

describe("Regex operator - % and _ escaping regression test", () => {
	test("case-insensitive exact match with % character should escape properly", () => {
		const db = new Database(":memory:");
		db.run(`CREATE TABLE test (id TEXT PRIMARY KEY, data TEXT)`);
		
		db.run(`INSERT INTO test (id, data) VALUES ('1', '{"name": "100%"}')`);
		db.run(`INSERT INTO test (id, data) VALUES ('2', '{"name": "100x"}')`);
		db.run(`INSERT INTO test (id, data) VALUES ('3', '{"name": "50%"}')`);
		
		const result = translateRegex("json_extract(data, '$.name')", '^100%$', 'i', mockSchema, 'name');
		
		expect(result).not.toBeNull();
		const rows = db.query(`SELECT * FROM test WHERE ${result!.sql}`).all(...result!.args);
		
		expect(rows.length).toBe(1);
		expect(JSON.parse((rows[0] as any).data).name).toBe("100%");
		
		db.close();
	});
	
	test("case-insensitive exact match with _ character should escape properly", () => {
		const db = new Database(":memory:");
		db.run(`CREATE TABLE test (id TEXT PRIMARY KEY, data TEXT)`);
		
		db.run(`INSERT INTO test (id, data) VALUES ('1', '{"name": "test_name"}')`);
		db.run(`INSERT INTO test (id, data) VALUES ('2', '{"name": "testxname"}')`);
		db.run(`INSERT INTO test (id, data) VALUES ('3', '{"name": "test-name"}')`);
		
		const result = translateRegex("json_extract(data, '$.name')", '^test_name$', 'i', mockSchema, 'name');
		
		expect(result).not.toBeNull();
		const rows = db.query(`SELECT * FROM test WHERE ${result!.sql}`).all(...result!.args);
		
		expect(rows.length).toBe(1);
		expect(JSON.parse((rows[0] as any).data).name).toBe("test_name");
		
		db.close();
	});
});
