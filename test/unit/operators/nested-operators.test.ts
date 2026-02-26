import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

interface TestDocType {
	id: string;
	name: string;
	age: number;
	tags: string[];
	active: boolean;
	score: number;
}

describe('Nested Operators: $not with $regex, $type', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-nested',
			databaseName: 'testdb-nested',
			collectionName: 'users-nested',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					age: { type: 'number' },
					tags: { type: 'array', items: { type: 'string' } },
					active: { type: 'boolean' },
					score: { type: 'number' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
				},
				required: ['id', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance.bulkWrite([
			{ document: { id: '1', name: 'Alice', age: 30, tags: ['admin', 'user'], active: true, score: 95.5, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } } },
			{ document: { id: '2', name: 'Bob', age: 25, tags: ['user'], active: false, score: 80.0, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 2000 } } },
			{ document: { id: '3', name: 'Charlie', age: 35, tags: ['admin'], active: true, score: 88.3, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 3000 } } },
			{ document: { id: '4', name: 'David', age: 28, tags: [], active: true, score: 92.1, _deleted: false, _attachments: {}, _rev: '1-d', _meta: { lwt: 4000 } } }
		], 'nested-test');
	});

	afterEach(async () => {
		await instance.remove();
	});

	describe('$not with $regex', () => {
		it('should handle simple regex pattern', async () => {
			const result = await instance.query({
				query: {
					selector: { name: { $not: { $regex: 'Alice' } } },
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual(['2', '3', '4']);
		});

		it('should handle regex with start anchor', async () => {
			const result = await instance.query({
				query: {
					selector: { name: { $not: { $regex: '^A' } } },
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual(['2', '3', '4']);
		});

		it('should handle regex with end anchor', async () => {
			const result = await instance.query({
				query: {
					selector: { name: { $not: { $regex: 'e$' } } },
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual(['2', '4']);
		});
	});

	describe('$not with $type (discovered bug)', () => {
		it('should handle $not with $type: string', async () => {
			const result = await instance.query({
				query: {
					selector: { name: { $not: { $type: 'string' } } },
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual([]);
		});

		it('should handle $not with $type: number', async () => {
			const result = await instance.query({
				query: {
					selector: { age: { $not: { $type: 'number' } } },
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual([]);
		});

		it('should handle $not with $type: boolean', async () => {
			const result = await instance.query({
				query: {
					selector: { active: { $not: { $type: 'boolean' } } },
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual([]);
		});
	});
});

describe('Nested Operators: $elemMatch with $regex, $type', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-elem',
			databaseName: 'testdb-elem',
			collectionName: 'users-elem',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					age: { type: 'number' },
					tags: { type: 'array', items: { type: 'string' } },
					active: { type: 'boolean' },
					score: { type: 'number' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
				},
				required: ['id', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance.bulkWrite([
			{ document: { id: '1', name: 'Alice', age: 30, tags: ['admin', 'user'], active: true, score: 95.5, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } } },
			{ document: { id: '2', name: 'Bob', age: 25, tags: ['user'], active: false, score: 80.0, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 2000 } } },
			{ document: { id: '3', name: 'Charlie', age: 35, tags: ['admin', 'moderator'], active: true, score: 88.3, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 3000 } } },
			{ document: { id: '4', name: 'David', age: 28, tags: [], active: true, score: 92.1, _deleted: false, _attachments: {}, _rev: '1-d', _meta: { lwt: 4000 } } }
		], 'elem-test');
	});

	afterEach(async () => {
		await instance.remove();
	});

	describe('$elemMatch with $regex', () => {
		it('should handle simple regex pattern', async () => {
			const result = await instance.query({
				query: {
					selector: { tags: { $elemMatch: { $regex: 'admin' } } },
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual(['1', '3']);
		});

		it('should handle regex with start anchor', async () => {
			const result = await instance.query({
				query: {
					selector: { tags: { $elemMatch: { $regex: '^admin' } } },
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual(['1', '3']);
		});

		it('should handle regex with partial match', async () => {
			const result = await instance.query({
				query: {
					selector: { tags: { $elemMatch: { $regex: 'mod' } } },
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual(['3']);
		});
	});

	describe('$elemMatch with $type', () => {
		it('should handle $type: string', async () => {
			const result = await instance.query({
				query: {
					selector: { tags: { $elemMatch: { $type: 'string' } } },
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual(['1', '2', '3']);
		});
	});
});

describe('Nested Operators: Logical operators with $regex', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-logical',
			databaseName: 'testdb-logical',
			collectionName: 'users-logical',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					age: { type: 'number' },
					tags: { type: 'array', items: { type: 'string' } },
					active: { type: 'boolean' },
					score: { type: 'number' },
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
				},
				required: ['id', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance.bulkWrite([
			{ document: { id: '1', name: 'Alice', age: 30, tags: ['admin'], active: true, score: 95.5, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } } },
			{ document: { id: '2', name: 'Bob', age: 25, tags: ['user'], active: false, score: 80.0, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 2000 } } },
			{ document: { id: '3', name: 'Charlie', age: 35, tags: ['admin'], active: true, score: 88.3, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 3000 } } }
		], 'logical-test');
	});

	afterEach(async () => {
		await instance.remove();
	});

	describe('$and with nested $regex', () => {
		it('should handle $and with multiple $regex', async () => {
			const result = await instance.query({
				query: {
					selector: {
						$and: [
							{ name: { $regex: '^A' } },
							{ name: { $regex: 'e$' } }
						]
					},
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual(['1']);
		});
	});

	describe('$or with nested $regex', () => {
		it('should handle $or with multiple $regex', async () => {
			const result = await instance.query({
				query: {
					selector: {
						$or: [
							{ name: { $regex: '^A' } },
							{ name: { $regex: '^B' } }
						]
					},
					sort: [{ id: 'asc' }]
				},
				queryPlan: {
					index: ['id'],
					sortSatisfiedByIndex: false,
					selectorSatisfiedByIndex: false,
					startKeys: [], endKeys: [],
					inclusiveStart: true, inclusiveEnd: true
				}
			} as any);

			expect(result.documents.map(d => d.id)).toEqual(['1', '2']);
		});
	});
});
