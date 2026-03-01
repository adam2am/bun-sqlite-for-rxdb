import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from '$app/types';

interface TestDocType {
	id: string;
	tags: string[];
	categories: string[];
	name: string;
	users: Array<{ name: string; email: string }>;
	_deleted: boolean;
	_attachments: Record<string, unknown>;
	_rev: string;
	_meta: { lwt: number };
}

describe('Regex Against Arrays Bug - TDD', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;

	const mockDocs: RxDocumentData<TestDocType>[] = [
		{
			id: '1',
			name: 'Alice',
			tags: ['Admin', 'User', 'Moderator'],
			categories: ['tech', 'business', 'admin'],
			users: [
				{ name: 'Alice', email: 'alice@example.com' },
				{ name: 'Bob', email: 'bob@example.com' }
			],
			_deleted: false,
			_attachments: {},
			_rev: '1-a',
			_meta: { lwt: 1000 }
		},
		{
			id: '2',
			name: 'Bob',
			tags: ['User', 'Guest'],
			categories: ['support', 'general'],
			users: [
				{ name: 'Charlie', email: 'charlie@example.com' }
			],
			_deleted: false,
			_attachments: {},
			_rev: '1-b',
			_meta: { lwt: 2000 }
		},
		{
			id: '3',
			name: 'Charlie',
			tags: ['Moderator', 'Premium'],
			categories: ['premium', 'vip'],
			users: [
				{ name: 'David', email: 'david@example.com' },
				{ name: 'Eve', email: 'eve@example.com' }
			],
			_deleted: false,
			_attachments: {},
			_rev: '1-c',
			_meta: { lwt: 3000 }
		},
		{
			id: '4',
			name: 'David',
			tags: [],
			categories: ['empty'],
			users: [],
			_deleted: false,
			_attachments: {},
			_rev: '1-d',
			_meta: { lwt: 4000 }
		}
	];

	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-regex-arrays',
			databaseName: 'testdb-regex-arrays',
			collectionName: 'docs-regex-arrays',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					tags: { type: 'array', items: { type: 'string' } },
					categories: { type: 'array', items: { type: 'string' } },
					users: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								email: { type: 'string' }
							}
						}
					},
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: {
						type: 'object',
						properties: {
							lwt: { type: 'number' }
						}
					}
				},
				required: ['id', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		await instance.bulkWrite(
			mockDocs.map(doc => ({ document: doc })),
			'regex-arrays-test'
		);
	});

	afterEach(async () => {
		await instance.remove();
	});

	it('should match array elements starting with "A" using $regex', async () => {
		const result = await instance.query({
			query: {
				selector: { tags: { $regex: '^A' } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual(['1']);
	});

	it('should match array elements ending with "r" using $regex', async () => {
		const result = await instance.query({
			query: {
				selector: { tags: { $regex: 'r$' } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		// Doc 1: ['Admin', 'User', 'Moderator'] - "User" and "Moderator" end with 'r' ✅
		// Doc 2: ['User', 'Guest'] - "User" ends with 'r' ✅
		// Doc 3: ['Moderator', 'Premium'] - "Moderator" ends with 'r' ✅
		expect(result.documents.map(d => d.id).sort()).toEqual(['1', '2', '3']);
	});

	it('should match array elements containing "mod" (case-insensitive)', async () => {
		const result = await instance.query({
			query: {
				selector: { tags: { $regex: 'mod', $options: 'i' } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id).sort()).toEqual(['1', '3']);
	});

	it('should NOT match when regex does not match any array element', async () => {
		const result = await instance.query({
			query: {
				selector: { tags: { $regex: '^Z' } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual([]);
	});

	it('should NOT match empty arrays', async () => {
		const result = await instance.query({
			query: {
				selector: { tags: { $regex: '.*' } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual(['1', '2', '3']);
	});

	it('should work with complex regex patterns on arrays', async () => {
		const result = await instance.query({
			query: {
				selector: { categories: { $regex: '^[a-z]{4,6}$' } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		// Pattern ^[a-z]{4,6}$ matches 4-6 lowercase letters
		// Doc 1: 'tech'(4)✅, 'admin'(5)✅ → MATCH
		// Doc 2: 'support'(7)❌, 'general'(7)❌ → NO MATCH
		// Doc 3: 'premium'(7)❌, 'vip'(3)❌ → NO MATCH
		// Doc 4: 'empty'(5)✅ → MATCH
		expect(result.documents.map(d => d.id).sort()).toEqual(['1', '4']);
	});

	it('should work with $regex on string fields (not arrays)', async () => {
		const result = await instance.query({
			query: {
				selector: { name: { $regex: '^A' } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual(['1']);
	});

	it('should match nested object arrays with regex (users.email)', async () => {
		const result = await instance.query({
			query: {
				selector: { 'users': { $elemMatch: { email: { $regex: '@example\\.com$' } } } },
				sort: [{ id: 'asc' }],
				skip: 0
			},
			queryPlan: {
				index: ['id'],
				sortSatisfiedByIndex: false,
				selectorSatisfiedByIndex: false,
				startKeys: [],
				endKeys: [],
				inclusiveStart: true,
				inclusiveEnd: true
			}
		});

		expect(result.documents.map(d => d.id)).toEqual(['1', '2', '3']);
	});
});
