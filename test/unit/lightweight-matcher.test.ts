import { describe, it, expect } from 'bun:test';
import { matchesSelector } from '$app/query/lightweight-matcher';
import type { RxDocumentData } from 'rxdb';

function testDoc<T>(data: T): RxDocumentData<T> {
	return {
		...data,
		_deleted: false,
		_attachments: {},
		_rev: '1-test',
		_meta: { lwt: Date.now() }
	};
}

describe('Lightweight Matcher - Comparison Operators', () => {
	const doc = testDoc({ age: 25, name: 'Alice', score: 85.5 });

	it('$eq - equals', () => {
		expect(matchesSelector(doc, { age: { $eq: 25 } })).toBe(true);
		expect(matchesSelector(doc, { age: { $eq: 30 } })).toBe(false);
		expect(matchesSelector(doc, { name: { $eq: 'Alice' } })).toBe(true);
	});

	it('$ne - not equals', () => {
		expect(matchesSelector(doc, { age: { $ne: 30 } })).toBe(true);
		expect(matchesSelector(doc, { age: { $ne: 25 } })).toBe(false);
	});

	it('$gt - greater than', () => {
		expect(matchesSelector(doc, { age: { $gt: 20 } })).toBe(true);
		expect(matchesSelector(doc, { age: { $gt: 25 } })).toBe(false);
		expect(matchesSelector(doc, { age: { $gt: 30 } })).toBe(false);
	});

	it('$gte - greater than or equal', () => {
		expect(matchesSelector(doc, { age: { $gte: 25 } })).toBe(true);
		expect(matchesSelector(doc, { age: { $gte: 20 } })).toBe(true);
		expect(matchesSelector(doc, { age: { $gte: 30 } })).toBe(false);
	});

	it('$lt - less than', () => {
		expect(matchesSelector(doc, { age: { $lt: 30 } })).toBe(true);
		expect(matchesSelector(doc, { age: { $lt: 25 } })).toBe(false);
		expect(matchesSelector(doc, { age: { $lt: 20 } })).toBe(false);
	});

	it('$lte - less than or equal', () => {
		expect(matchesSelector(doc, { age: { $lte: 25 } })).toBe(true);
		expect(matchesSelector(doc, { age: { $lte: 30 } })).toBe(true);
		expect(matchesSelector(doc, { age: { $lte: 20 } })).toBe(false);
	});
});

describe('Lightweight Matcher - Array Operators', () => {
	const doc = testDoc({ tags: ['javascript', 'typescript'], count: 3 });

	it('$in - value in array', () => {
		expect(matchesSelector(doc, { count: { $in: [1, 2, 3] } })).toBe(true);
		expect(matchesSelector(doc, { count: { $in: [4, 5, 6] } })).toBe(false);
		expect(matchesSelector(doc, { count: { $in: [] } })).toBe(false);
	});

	it('$nin - value not in array', () => {
		expect(matchesSelector(doc, { count: { $nin: [4, 5, 6] } })).toBe(true);
		expect(matchesSelector(doc, { count: { $nin: [1, 2, 3] } })).toBe(false);
		expect(matchesSelector(doc, { count: { $nin: [] } })).toBe(true);
	});

	it('$size - array size', () => {
		expect(matchesSelector(doc, { tags: { $size: 2 } })).toBe(true);
		expect(matchesSelector(doc, { tags: { $size: 3 } })).toBe(false);
	});

	it('$elemMatch - array element matching', () => {
		const doc2 = testDoc({ items: [{ price: 10 }, { price: 20 }, { price: 30 }] });
		expect(matchesSelector(doc2, { items: { $elemMatch: { price: { $gt: 15 } } } })).toBe(true);
		expect(matchesSelector(doc2, { items: { $elemMatch: { price: { $gt: 50 } } } })).toBe(false);
	});
});

describe('Lightweight Matcher - Logical Operators', () => {
	const doc = testDoc({ age: 25, name: 'Alice', active: true });

	it('$and - logical AND', () => {
		expect(matchesSelector(doc, { $and: [{ age: { $gt: 20 } }, { active: true }] })).toBe(true);
		expect(matchesSelector(doc, { $and: [{ age: { $gt: 30 } }, { active: true }] })).toBe(false);
		expect(matchesSelector(doc, { $and: [] })).toBe(true);
	});

	it('$or - logical OR', () => {
		expect(matchesSelector(doc, { $or: [{ age: { $gt: 30 } }, { active: true }] })).toBe(true);
		expect(matchesSelector(doc, { $or: [{ age: { $gt: 30 } }, { active: false }] })).toBe(false);
		expect(matchesSelector(doc, { $or: [] })).toBe(false);
	});

	it('$nor - logical NOR', () => {
		expect(matchesSelector(doc, { $nor: [{ age: { $gt: 30 } }, { active: false }] })).toBe(true);
		expect(matchesSelector(doc, { $nor: [{ age: { $gt: 20 } }, { active: false }] })).toBe(false);
		expect(matchesSelector(doc, { $nor: [] })).toBe(true);
	});

	it('$not - logical NOT', () => {
		expect(matchesSelector(doc, { age: { $not: { $gt: 30 } } })).toBe(true);
		expect(matchesSelector(doc, { age: { $not: { $gt: 20 } } })).toBe(false);
	});
});

describe('Lightweight Matcher - Element Operators', () => {
	const doc = testDoc({ age: 25, name: 'Alice', address: undefined, missing: undefined });

	it('$exists - field exists', () => {
		expect(matchesSelector(doc, { age: { $exists: true } })).toBe(true);
		expect(matchesSelector(doc, { address: { $exists: false } })).toBe(true);
		expect(matchesSelector(doc, { missing: { $exists: false } })).toBe(true);
		expect(matchesSelector(doc, { age: { $exists: false } })).toBe(false);
	});

	it('$type - field type', () => {
		expect(matchesSelector(doc, { age: { $type: 'number' } })).toBe(true);
		expect(matchesSelector(doc, { name: { $type: 'string' } })).toBe(true);
		expect(matchesSelector(doc, { age: { $type: 'string' } })).toBe(false);
		
		const doc2 = testDoc({ tags: ['a', 'b'] });
		expect(matchesSelector(doc2, { tags: { $type: 'array' } })).toBe(true);
	});
});

describe('Lightweight Matcher - Evaluation Operators', () => {
	it('$regex - pattern matching', () => {
		const doc = testDoc({ name: 'Alice', email: 'alice@example.com' });
		expect(matchesSelector(doc, { name: { $regex: '^A' } })).toBe(true);
		expect(matchesSelector(doc, { name: { $regex: '^B' } })).toBe(false);
		expect(matchesSelector(doc, { email: { $regex: '@example\\.com$' } })).toBe(true);
	});

	it('$regex - case insensitive', () => {
		const doc = testDoc({ name: 'Alice' });
		expect(matchesSelector(doc, { name: { $regex: '^alice$', $options: 'i' } })).toBe(true);
		expect(matchesSelector(doc, { name: { $regex: '^alice$' } })).toBe(false);
	});

	it('$mod - modulo', () => {
		const doc = testDoc({ count: 10 });
		expect(matchesSelector(doc, { count: { $mod: [3, 1] as [number, number] } })).toBe(true);
		expect(matchesSelector(doc, { count: { $mod: [3, 0] as [number, number] } })).toBe(false);
	});
});

describe('Lightweight Matcher - Nested Fields', () => {
	const doc = testDoc({ user: { name: 'Alice', address: { city: 'NYC' } } });

	it('nested field access', () => {
		expect(matchesSelector(doc, { 'user.name': { $eq: 'Alice' } })).toBe(true);
		expect(matchesSelector(doc, { 'user.address.city': { $eq: 'NYC' } })).toBe(true);
		expect(matchesSelector(doc, { 'user.address.city': { $eq: 'LA' } })).toBe(false);
	});
});

describe('Lightweight Matcher - Edge Cases', () => {
	it('null values', () => {
		const doc = testDoc({ value: null });
		expect(matchesSelector(doc, { value: { $eq: null } })).toBe(true);
		expect(matchesSelector(doc, { value: { $ne: null } })).toBe(false);
	});

	it('undefined values', () => {
		const doc = testDoc({ value: undefined });
		expect(matchesSelector(doc, { value: { $exists: false } })).toBe(true);
	});

	it('empty arrays', () => {
		const doc = testDoc({ tags: [] });
		expect(matchesSelector(doc, { tags: { $size: 0 } })).toBe(true);
		expect(matchesSelector(doc, { tags: { $in: [] } })).toBe(false);
	});

	it('direct equality (no operator)', () => {
		const doc = testDoc({ age: 25, name: 'Alice' });
		expect(matchesSelector(doc, { age: 25 })).toBe(true);
		expect(matchesSelector(doc, { age: 30 })).toBe(false);
		expect(matchesSelector(doc, { name: 'Alice' })).toBe(true);
	});

	it('empty selector', () => {
		const doc = testDoc({ age: 25 });
		expect(matchesSelector(doc, {})).toBe(true);
	});

	it('multiple conditions on same field', () => {
		const doc = testDoc({ age: 25 });
		expect(matchesSelector(doc, { age: { $gt: 20, $lt: 30 } })).toBe(true);
		expect(matchesSelector(doc, { age: { $gt: 20, $lt: 25 } })).toBe(false);
	});
});

describe('Lightweight Matcher - Complex Queries', () => {
	const doc = testDoc({ age: 25, name: 'Alice', tags: ['javascript', 'typescript'], active: true });

	it('combined operators', () => {
		expect(matchesSelector(doc, {
			$and: [
				{ age: { $gte: 18, $lte: 30 } },
				{ active: true },
				{ tags: { $size: 2 } }
			]
		})).toBe(true);
	});

	it('nested logical operators', () => {
		expect(matchesSelector(doc, {
			$or: [
				{ $and: [{ age: { $gt: 30 } }, { active: true }] },
				{ $and: [{ age: { $lt: 30 } }, { name: 'Alice' }] }
			]
		})).toBe(true);
	});
});
