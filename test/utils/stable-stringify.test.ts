/**
 * Phase 1: Edge case tests for stable-stringify
 * 
 * Comprehensive test coverage to ensure correctness before optimization.
 */

import { describe, it, expect } from 'bun:test';
import { stableStringify } from '../../src/utils/stable-stringify';

describe('stableStringify - Primitives', () => {
	it('should handle null', () => {
		expect(stableStringify(null)).toBe('null');
	});

	it('should handle undefined', () => {
		expect(stableStringify(undefined)).toBe('null');
	});

	it('should handle true', () => {
		expect(stableStringify(true)).toBe('true');
	});

	it('should handle false', () => {
		expect(stableStringify(false)).toBe('false');
	});

	it('should handle numbers', () => {
		expect(stableStringify(0)).toBe('0');
		expect(stableStringify(42)).toBe('42');
		expect(stableStringify(-42)).toBe('-42');
		expect(stableStringify(3.14)).toBe('3.14');
	});

	it('should handle special numbers', () => {
		expect(stableStringify(NaN)).toBe('null');
		expect(stableStringify(Infinity)).toBe('null');
		expect(stableStringify(-Infinity)).toBe('null');
	});

	it('should handle strings', () => {
		expect(stableStringify('')).toBe('""');
		expect(stableStringify('hello')).toBe('"hello"');
		expect(stableStringify('hello world')).toBe('"hello world"');
	});

	it('should escape special characters in strings', () => {
		expect(stableStringify('hello\nworld')).toBe('"hello\\nworld"');
		expect(stableStringify('hello\tworld')).toBe('"hello\\tworld"');
		expect(stableStringify('hello"world')).toBe('"hello\\"world"');
		expect(stableStringify('hello\\world')).toBe('"hello\\\\world"');
	});
});

describe('stableStringify - Arrays', () => {
	it('should handle empty arrays', () => {
		expect(stableStringify([])).toBe('[]');
	});

	it('should handle simple arrays', () => {
		expect(stableStringify([1, 2, 3])).toBe('[1,2,3]');
		expect(stableStringify(['a', 'b', 'c'])).toBe('["a","b","c"]');
	});

	it('should handle mixed type arrays', () => {
		expect(stableStringify([1, 'a', true, null])).toBe('[1,"a",true,null]');
	});

	it('should handle nested arrays', () => {
		expect(stableStringify([[1, 2], [3, 4]])).toBe('[[1,2],[3,4]]');
		expect(stableStringify([[[1]]])).toBe('[[[1]]]');
	});

	it('should handle arrays with undefined', () => {
		expect(stableStringify([1, undefined, 3])).toBe('[1,null,3]');
	});
});

describe('stableStringify - Objects', () => {
	it('should handle empty objects', () => {
		expect(stableStringify({})).toBe('{}');
	});

	it('should handle simple objects', () => {
		expect(stableStringify({ a: 1 })).toBe('{"a":1}');
		expect(stableStringify({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
	});

	it('should sort object keys deterministically', () => {
		const obj1 = { b: 2, a: 1 };
		const obj2 = { a: 1, b: 2 };
		expect(stableStringify(obj1)).toBe('{"a":1,"b":2}');
		expect(stableStringify(obj2)).toBe('{"a":1,"b":2}');
		expect(stableStringify(obj1)).toBe(stableStringify(obj2));
	});

	it('should handle nested objects', () => {
		const obj = { a: { b: { c: 1 } } };
		expect(stableStringify(obj)).toBe('{"a":{"b":{"c":1}}}');
	});

	it('should handle objects with various value types', () => {
		const obj = { a: 1, b: 'hello', c: true, d: null, e: undefined };
		expect(stableStringify(obj)).toBe('{"a":1,"b":"hello","c":true,"d":null}');
	});

	it('should handle objects with many keys', () => {
		const obj: Record<string, number> = {};
		for (let i = 0; i < 300; i++) {
			obj[`key${i}`] = i;
		}
		const result = stableStringify(obj);
		expect(result).toContain('"key0":0');
		expect(result).toContain('"key299":299');
		// Verify keys are sorted
		const keys = Object.keys(obj).sort();
		expect(result).toContain(`"${keys[0]}"`);
	});
});

describe('stableStringify - Complex Structures', () => {
	it('should handle arrays of objects', () => {
		const arr = [{ b: 2, a: 1 }, { d: 4, c: 3 }];
		expect(stableStringify(arr)).toBe('[{"a":1,"b":2},{"c":3,"d":4}]');
	});

	it('should handle objects with array values', () => {
		const obj = { a: [1, 2, 3], b: [4, 5, 6] };
		expect(stableStringify(obj)).toBe('{"a":[1,2,3],"b":[4,5,6]}');
	});

	it('should handle deeply nested structures', () => {
		const obj = {
			a: {
				b: [
					{ c: 1, d: 2 },
					{ e: 3, f: 4 }
				]
			}
		};
		expect(stableStringify(obj)).toBe('{"a":{"b":[{"c":1,"d":2},{"e":3,"f":4}]}}');
	});
});

describe('stableStringify - Mango Query Shapes', () => {
	it('should handle simple equality query', () => {
		const query = { age: 20 };
		expect(stableStringify(query)).toBe('{"age":20}');
	});

	it('should handle query with operators', () => {
		const query = { age: { $gt: 18, $lt: 65 } };
		expect(stableStringify(query)).toBe('{"age":{"$gt":18,"$lt":65}}');
	});

	it('should handle query with $and', () => {
		const query = { $and: [{ age: { $gt: 18 } }, { status: 'active' }] };
		expect(stableStringify(query)).toBe('{"$and":[{"age":{"$gt":18}},{"status":"active"}]}');
	});

	it('should handle query with $regex', () => {
		const query = { name: { $regex: '^John', $options: 'i' } };
		expect(stableStringify(query)).toBe('{"name":{"$options":"i","$regex":"^John"}}');
	});

	it('should produce same string for queries with different key order', () => {
		const query1 = { age: 20, name: 'John', status: 'active' };
		const query2 = { status: 'active', name: 'John', age: 20 };
		const query3 = { name: 'John', age: 20, status: 'active' };
		
		const str1 = stableStringify(query1);
		const str2 = stableStringify(query2);
		const str3 = stableStringify(query3);
		
		expect(str1).toBe(str2);
		expect(str2).toBe(str3);
		expect(str1).toBe('{"age":20,"name":"John","status":"active"}');
	});
});

describe('stableStringify - Edge Cases', () => {
	it('should handle functions', () => {
		expect(stableStringify(() => {})).toBe('null');
		expect(stableStringify({ a: () => {} })).toBe('{"a":null}');
	});

	it('should handle symbols', () => {
		expect(stableStringify(Symbol('test'))).toBe('null');
		expect(stableStringify({ a: Symbol('test') })).toBe('{"a":null}');
	});

	it('should handle Date objects', () => {
		const date = new Date('2026-02-26T00:00:00.000Z');
		const result = stableStringify(date);
		expect(result).toBe('"2026-02-26T00:00:00.000Z"');
	});

	it('should handle RegExp objects', () => {
		const regex = /test/gi;
		const result = stableStringify(regex);
		expect(result).toBe('{"$regex":"test","$options":"gi"}');
	});

	it('should handle Error objects', () => {
		const error = new Error('test error');
		const result = stableStringify(error);
		expect(result).toBe('{}');
	});

	it('should handle BigInt', () => {
		expect(stableStringify(BigInt(123))).toBe('123');
		expect(stableStringify({ a: BigInt(999) })).toBe('{"a":999}');
	});

	it('should handle circular references in objects', () => {
		const circular: any = { name: 'test' };
		circular.self = circular;
		const result = stableStringify(circular);
		expect(result).toContain('[Circular]');
		expect(result).toContain('"name":"test"');
	});

	it('should handle circular references in arrays', () => {
		const circular: any = [1, 2];
		circular.push(circular);
		const result = stableStringify(circular);
		expect(result).toContain('[Circular]');
		expect(result).toContain('1');
		expect(result).toContain('2');
	});

	it('should handle deeply nested circular references', () => {
		const obj: any = { a: { b: { c: {} } } };
		obj.a.b.c.loop = obj;
		const result = stableStringify(obj);
		expect(result).toContain('[Circular]');
	});

	it('should handle objects with numeric keys', () => {
		const obj = { '1': 'a', '10': 'b', '2': 'c' };
		const result = stableStringify(obj);
		expect(result).toBe('{"1":"a","10":"b","2":"c"}');
	});

	it('should handle toJSON that throws', () => {
		const obj = {
			name: 'test',
			toJSON() {
				throw new Error('boom');
			}
		};
		const result = stableStringify(obj);
		expect(result).toBe('"[Error: boom]"');
	});
});
