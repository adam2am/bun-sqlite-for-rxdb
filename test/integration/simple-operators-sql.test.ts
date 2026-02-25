import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getRxStorageBunSQLite } from './storage';
import type { RxDocumentData, RxStorage, RxStorageInstance } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from './types';

interface TestDocType {
	id: string;
	name: string;
	age: number;
	status: string;
	tags: string[];
	score: number | null;
	metadata: { active: boolean };
}

describe('Simple SQL Operators (Integration Tests)', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;
	
	afterEach(async () => {
		await instance.remove();
	});
	
	beforeEach(async () => {
		storage = getRxStorageBunSQLite();
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token',
			databaseName: 'testdb',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					age: { type: 'number' },
					status: { type: 'string' },
					tags: { type: 'array', items: { type: 'string' } },
					score: { type: ['number', 'null'] },
					metadata: { 
						type: 'object',
						properties: {
							active: { type: 'boolean' }
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
		
		// Insert test data
		const docs: RxDocumentData<TestDocType>[] = [
			{ id: 'user1', name: 'Alice', age: 30, status: 'active', tags: ['admin', 'user'], score: 95, metadata: { active: true }, _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: Date.now() } },
			{ id: 'user2', name: 'Bob', age: 25, status: 'inactive', tags: ['user'], score: 80, metadata: { active: false }, _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: Date.now() } },
			{ id: 'user3', name: 'Charlie', age: 35, status: 'active', tags: ['user', 'moderator'], score: null, metadata: { active: true }, _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: Date.now() } },
			{ id: 'user4', name: 'Diana', age: 28, status: 'pending', tags: [], score: 88, metadata: { active: false }, _deleted: false, _attachments: {}, _rev: '1-d', _meta: { lwt: Date.now() } }
		];
		
		await instance.bulkWrite(docs.map(doc => ({ document: doc })), 'test-context');
	});
	
	// Comparison Operators
	describe('$eq', () => {
		it('matches exact value', async () => {
			const result = await instance.query({ 
				query: { selector: { age: { $eq: 30 } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].id).toBe('user1');
		});
		
		it('matches string value', async () => {
			const result = await instance.query({ 
				query: { selector: { status: { $eq: 'active' } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user1');
			expect(result.documents[1].id).toBe('user3');
		});
	});
	
	describe('$ne', () => {
		it('excludes matching value', async () => {
			const result = await instance.query({ 
				query: { selector: { status: { $ne: 'active' } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user2');
			expect(result.documents[1].id).toBe('user4');
		});
	});
	
	describe('$gt', () => {
		it('matches greater than', async () => {
			const result = await instance.query({ 
				query: { selector: { age: { $gt: 28 } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user1');
			expect(result.documents[1].id).toBe('user3');
		});
	});
	
	describe('$gte', () => {
		it('matches greater than or equal', async () => {
			const result = await instance.query({ 
				query: { selector: { age: { $gte: 30 } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user1');
			expect(result.documents[1].id).toBe('user3');
		});
	});
	
	describe('$lt', () => {
		it('matches less than', async () => {
			const result = await instance.query({ 
				query: { selector: { age: { $lt: 30 } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user2');
			expect(result.documents[1].id).toBe('user4');
		});
	});
	
	describe('$lte', () => {
		it('matches less than or equal', async () => {
			const result = await instance.query({ 
				query: { selector: { age: { $lte: 28 } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user2');
			expect(result.documents[1].id).toBe('user4');
		});
	});
	
	// Array Operators
	describe('$in', () => {
		it('matches any value in array', async () => {
			const result = await instance.query({ 
				query: { selector: { status: { $in: ['active', 'pending'] } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(3);
			expect(result.documents[0].id).toBe('user1');
			expect(result.documents[1].id).toBe('user3');
			expect(result.documents[2].id).toBe('user4');
		});
		
		it('matches numbers in array', async () => {
			const result = await instance.query({ 
				query: { selector: { age: { $in: [25, 35] } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user2');
			expect(result.documents[1].id).toBe('user3');
		});
	});
	
	describe('$nin', () => {
		it('excludes values in array', async () => {
			const result = await instance.query({ 
				query: { selector: { status: { $nin: ['active', 'pending'] } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].id).toBe('user2');
		});
	});
	
	// Existence Operator
	describe('$exists', () => {
		it('matches fields that exist (not null)', async () => {
			const result = await instance.query({ 
				query: { selector: { score: { $exists: true } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(3);
			expect(result.documents[0].id).toBe('user1');
			expect(result.documents[1].id).toBe('user2');
			expect(result.documents[2].id).toBe('user4');
		});
		
		it('matches fields that do not exist (null)', async () => {
			const result = await instance.query({ 
				query: { selector: { score: { $exists: false } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].id).toBe('user3');
		});
	});
	
	// Simple Regex (LIKE patterns)
	describe('$regex (simple)', () => {
		it('matches prefix pattern', async () => {
			const result = await instance.query({ 
				query: { selector: { name: { $regex: '^Ali' } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].id).toBe('user1');
		});
		
		it('matches suffix pattern', async () => {
			const result = await instance.query({ 
				query: { selector: { name: { $regex: 'ice$' } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].id).toBe('user1');
		});
		
		it('matches contains pattern', async () => {
			const result = await instance.query({ 
				query: { selector: { name: { $regex: 'har' } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].id).toBe('user3');
		});
	});
	
	// Logical Operators
	describe('$and', () => {
		it('matches all conditions', async () => {
			const result = await instance.query({ 
				query: { 
					selector: { 
						$and: [
							{ age: { $gte: 28 } },
							{ status: { $eq: 'active' } }
						]
					}, 
					sort: [{ id: 'asc' }], 
					skip: 0 
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user1');
			expect(result.documents[1].id).toBe('user3');
		});
	});
	
	describe('$or', () => {
		it('matches any condition', async () => {
			const result = await instance.query({ 
				query: { 
					selector: { 
						$or: [
							{ age: { $lt: 26 } },
							{ age: { $gt: 34 } }
						]
					}, 
					sort: [{ id: 'asc' }], 
					skip: 0 
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user2');
			expect(result.documents[1].id).toBe('user3');
		});
	});
	
	describe('$not', () => {
		it('negates condition', async () => {
			const result = await instance.query({ 
				query: { 
					selector: { 
						age: { $not: { $lt: 30 } }
					}, 
					sort: [{ id: 'asc' }], 
					skip: 0 
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user1');
			expect(result.documents[1].id).toBe('user3');
		});
	});
	
	describe('$nor', () => {
		it('matches none of the conditions', async () => {
			const result = await instance.query({ 
				query: { 
					selector: { 
						$nor: [
							{ status: { $eq: 'active' } },
							{ age: { $lt: 26 } }
						]
					}, 
					sort: [{ id: 'asc' }], 
					skip: 0 
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].id).toBe('user4');
		});
	});
	
	// Type Operator (simple types)
	describe('$type (simple)', () => {
		it('matches number type', async () => {
			const result = await instance.query({ 
				query: { selector: { age: { $type: 'number' } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(4);
		});
		
		it('matches string type', async () => {
			const result = await instance.query({ 
				query: { selector: { name: { $type: 'string' } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(4);
		});
		
		it('matches null type', async () => {
			const result = await instance.query({ 
				query: { selector: { score: { $type: 'null' } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].id).toBe('user3');
		});
	});
	
	// Size Operator
	describe('$size', () => {
		it('matches array length', async () => {
			const result = await instance.query({ 
				query: { selector: { tags: { $size: 2 } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user1');
			expect(result.documents[1].id).toBe('user3');
		});
		
		it('matches empty array', async () => {
			const result = await instance.query({ 
				query: { selector: { tags: { $size: 0 } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(1);
			expect(result.documents[0].id).toBe('user4');
		});
	});
	
	// Mod Operator
	describe('$mod', () => {
		it('matches modulo result', async () => {
			const result = await instance.query({ 
				query: { selector: { age: { $mod: [5, 0] as any } }, sort: [{ id: 'asc' }], skip: 0 },
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(3);
			expect(result.documents[0].id).toBe('user1');
			expect(result.documents[1].id).toBe('user2');
			expect(result.documents[2].id).toBe('user3');
		});
	});
	
	// Complex Queries
	describe('Complex SQL queries', () => {
		it('combines multiple operators', async () => {
			const result = await instance.query({ 
				query: { 
					selector: { 
						$and: [
							{ age: { $gte: 25, $lte: 30 } },
							{ status: { $in: ['active', 'inactive'] } }
						]
					}, 
					sort: [{ id: 'asc' }], 
					skip: 0 
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user1');
			expect(result.documents[1].id).toBe('user2');
		});
		
		it('handles nested $or and $and', async () => {
			const result = await instance.query({ 
				query: { 
					selector: { 
						$or: [
							{ $and: [{ age: { $lt: 30 } }, { status: { $eq: 'inactive' } }] },
							{ age: { $gt: 30 } }
						]
					}, 
					sort: [{ id: 'asc' }], 
					skip: 0 
				},
				queryPlan: { index: [], startKeys: [], endKeys: [], inclusiveStart: true, inclusiveEnd: true, sortSatisfiedByIndex: false, selectorSatisfiedByIndex: false }
			});
			
			expect(result.documents).toHaveLength(2);
			expect(result.documents[0].id).toBe('user2');
			expect(result.documents[1].id).toBe('user3');
		});
	});
});
