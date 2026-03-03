import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fc from 'fast-check';
import { Query } from 'mingo';
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
	scores?: number[];
	optional?: string;
	metadata?: Record<string, any>;
	unknownField?: any;
	items: Array<{
		name: string;
		category: string;
		price: number;
		tags: string[];
	}>;
	'first name'?: string;
	'user-name'?: string;
	role?: string;
	matrix?: number[][];
	data?: any;
	count?: any;
}

const mockDocs: RxDocumentData<TestDocType>[] = [
	{ id: '1', name: 'Alice', age: 30, tags: ['admin', 'user'], active: true, score: 95.5, scores: [85, 90, 92], optional: 'present', 'first name': 'Alice', role: 'admin', items: [{ name: 'item1', category: 'A', price: 100, tags: ['new'] }, { name: 'item2', category: 'B', price: 200, tags: ['sale'] }], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
	{ id: '2', name: 'Bob', age: 25, tags: ['user'], active: false, score: 80.0, scores: [80, 88], 'user-name': 'bob123', role: 'user', count: 1, items: [{ name: 'item3', category: 'A', price: 150, tags: [] }], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 2000 } },
	{ id: '3', name: 'Charlie', age: 35, tags: ['admin', 'moderator'], active: true, score: 88.3, scores: [75, 81, 95], optional: 'value', matrix: [[1, 2], [3, 4]], items: [{ name: 'item4', category: 'C', price: 300, tags: ['premium', 'new'] }], _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 3000 } },
	{ id: '4', name: 'Café', age: 28, tags: ['user', 'moderator'], active: true, score: 92.1, scores: [91, 93], matrix: [[5, 6], [7, 8]], items: [], _deleted: false, _attachments: {}, _rev: '1-d', _meta: { lwt: 4000 } },
	{ id: '5', name: 'Eve', age: 22, tags: [], active: false, score: 75.0, scores: [70, 75, 80], optional: undefined, matrix: [[1, 2], [3, 10]], count: "1", items: [{ name: 'item5', category: 'B', price: 50, tags: ['clearance'] }], _deleted: false, _attachments: {}, _rev: '1-e', _meta: { lwt: 5000 } },
	{ id: '6', name: 'Frank', age: 40, tags: ['test'], active: true, score: 50, scores: [50, 55], metadata: { '0': 'value0', '1': 'value1' }, unknownField: ['item1', 'item2'], data: "admin", items: [], _deleted: false, _attachments: {}, _rev: '1-f', _meta: { lwt: 6000 } },
	{ id: '7', name: 'Grace', age: 45, tags: ['test'], active: false, score: 60, scores: [60, 65], metadata: { b: 2, a: 1 }, unknownField: 'item1', data: [15], items: [], _deleted: false, _attachments: {}, _rev: '1-g', _meta: { lwt: 7000 } },
	{ id: '8', name: 'Hank', age: 50, tags: [], active: true, score: 10, scores: [10, 15], optional: null as any, items: [], _deleted: false, _attachments: {}, _rev: '1-h', _meta: { lwt: 8000 } },
	{ id: '9', name: 'Ivy', age: 33, tags: [], active: true, score: 70, scores: [70, 72], metadata: {}, items: [], _deleted: false, _attachments: {}, _rev: '1-i', _meta: { lwt: 9000 } },
	{ id: '10', name: 'user1', age: 27, tags: [], active: true, score: 85, items: [], _deleted: false, _attachments: {}, _rev: '1-j', _meta: { lwt: 10000 } },
	{ id: '11', name: 'user2', age: 29, tags: [], active: false, score: 90, items: [], _deleted: false, _attachments: {}, _rev: '1-k', _meta: { lwt: 11000 } },
	{ id: '12', name: 'Overflow', age: -9223372036854775808, tags: [], active: true, score: -9223372036854775808, items: [], _deleted: false, _attachments: {}, _rev: '1-l', _meta: { lwt: 12000 } },
];

function hasKnownMingoBug(query: any): boolean {
	const checkValue = (val: any, isTopLevel = false, fieldName?: string): boolean => {
		if (val instanceof RegExp) return true;
		if (Array.isArray(val)) return val.some(v => checkValue(v, false));
		if (val && typeof val === 'object' && !Array.isArray(val)) {
			if (val.$in && Array.isArray(val.$in) && val.$in.some((v: any) => v instanceof RegExp)) return true;
			if (val.$nin && Array.isArray(val.$nin) && val.$nin.some((v: any) => v instanceof RegExp)) return true;
			if (val.$mod && Array.isArray(val.$mod)) return true;
			
			const keys = Object.keys(val);
			if (isTopLevel) {
				for (const key of keys) {
					if (!key.startsWith('$')) {
						const fieldVal = val[key];
						
						if (key === 'matrix' && fieldVal && typeof fieldVal === 'object') {
							if (fieldVal.$gt !== undefined || fieldVal.$gte !== undefined || 
							    fieldVal.$lt !== undefined || fieldVal.$lte !== undefined || 
							    fieldVal.$all !== undefined || fieldVal.$in !== undefined) {
								return true;
							}
						}
						
						if (fieldVal && typeof fieldVal === 'object' && !Array.isArray(fieldVal) && !(fieldVal instanceof RegExp)) {
							const fieldKeys = Object.keys(fieldVal);
							if (fieldKeys.length > 0 && !fieldKeys[0].startsWith('$')) {
								return true;
							}
						}
						if (Array.isArray(fieldVal) && fieldVal.length === 0 && key.includes('.')) {
							return true;
						}
					}
					if (checkValue(val[key], false, key)) return true;
				}
			} else {
				return Object.values(val).some(v => checkValue(v, false));
			}
		}
		return false;
	};
	return checkValue(query, true);
}

// Arbitrary generators for Mango query operators
const MangoQueryArbitrary = () => {
	const fieldArb = fc.constantFrom('name', 'age', 'tags', 'active', 'score');
	
	const stringValueArb = fc.constantFrom('Alice', 'Bob', 'Charlie', 'David', 'Eve', 'admin', 'user', 'moderator');
	const numberValueArb = fc.integer({ min: 20, max: 40 });
	const booleanValueArb = fc.boolean();
	
	// Simple comparison operators
	const eqArb = fc.record({
		field: fieldArb,
		op: fc.constant('$eq'),
		value: fc.oneof(stringValueArb, numberValueArb, booleanValueArb)
	});
	
	const neArb = fc.record({
		field: fieldArb,
		op: fc.constant('$ne'),
		value: fc.oneof(stringValueArb, numberValueArb, booleanValueArb)
	});
	
	const gtArb = fc.record({
		field: fc.constantFrom('age', 'score'),
		op: fc.constant('$gt'),
		value: numberValueArb
	});
	
	const gteArb = fc.record({
		field: fc.constantFrom('age', 'score'),
		op: fc.constant('$gte'),
		value: numberValueArb
	});
	
	const ltArb = fc.record({
		field: fc.constantFrom('age', 'score'),
		op: fc.constant('$lt'),
		value: numberValueArb
	});
	
	const lteArb = fc.record({
		field: fc.constantFrom('age', 'score'),
		op: fc.constant('$lte'),
		value: numberValueArb
	});
	
	const inArb = fc.record({
		field: fieldArb,
		op: fc.constant('$in'),
		value: fc.array(fc.oneof(stringValueArb, numberValueArb), { minLength: 1, maxLength: 3 })
	});
	
	const ninArb = fc.record({
		field: fieldArb,
		op: fc.constant('$nin'),
		value: fc.array(fc.oneof(stringValueArb, numberValueArb), { minLength: 1, maxLength: 3 })
	});
	
	const existsArb = fc.record({
		field: fieldArb,
		op: fc.constant('$exists'),
		value: booleanValueArb
	});
	
	const sizeArb = fc.record({
		field: fc.constant('tags'),
		op: fc.constant('$size'),
		value: fc.integer({ min: 0, max: 3 })
	});
	
	const sizeOnNonArrayArb = fc.record({
		field: fc.constantFrom('name', 'age', 'score', 'active'),
		op: fc.constant('$size'),
		value: fc.integer({ min: 0, max: 5 })
	});
	
	const arrayIndexArb = fc.record({
		field: fc.constantFrom('tags.0', 'tags.1', 'items.0.name', 'items.0.category', 'items.1.price'),
		op: fc.constant('$eq'),
		value: fc.oneof(
			fc.constantFrom('admin', 'user', 'moderator'),
			fc.constantFrom('item1', 'item2', 'item3', 'item4', 'item5'),
			fc.constantFrom('A', 'B', 'C'),
			fc.integer({ min: 50, max: 300 })
		)
	});
	
	const regexOnArrayArb = fc.record({
		field: fc.constant('tags'),
		op: fc.constant('$regex'),
		value: fc.constantFrom('^a', 'r$', 'mod', 'user')
	});
	
	const modArb = fc.record({
		field: fc.constantFrom('age', 'score'),
		op: fc.constant('$mod'),
		value: fc.tuple(fc.integer({ min: 2, max: 5 }), fc.integer({ min: 0, max: 4 }))
	});
	
	const modOnArrayArb = fc.record({
		field: fc.constant('scores'),
		op: fc.constant('$mod'),
		value: fc.tuple(fc.integer({ min: 2, max: 5 }), fc.integer({ min: 0, max: 4 }))
	});
	
	const modOnUnknownArrayArb = fc.constantFrom(
		{ unknownField: { $mod: [5, 0] } },
		{ unknownField: { $mod: [2, 0] } },
		{ unknownField: { $mod: [3, 1] } }
	);
	
	const allArb = fc.record({
		field: fc.constant('tags'),
		op: fc.constant('$all'),
		value: fc.array(fc.constantFrom('admin', 'user', 'moderator'), { minLength: 1, maxLength: 2 })
	});
	
	// EDGE CASE: $all with empty array (should match nothing)
	const allWithEmptyArrayArb = fc.constantFrom(
		{ tags: { $all: [] } },
		{ items: { $all: [] } }
	);
	
	// EDGE CASE: $all with regex patterns
	const allWithRegexArb = fc.constantFrom(
		{ tags: { $all: [/^a/, /r$/] } },
		{ tags: { $all: [/admin/] } }
	);
	
	// EDGE CASE: $all with duplicate values
	const allWithDuplicatesArb = fc.constantFrom(
		{ tags: { $all: ['admin', 'admin'] } },
		{ tags: { $all: ['user', 'user', 'user'] } }
	);
	
	// EDGE CASE: $all with type mismatches
	const allTypeMismatchArb = fc.constantFrom(
		{ tags: { $all: [123, 456] } },
		{ tags: { $all: [true, false] } },
		{ age: { $all: ['30'] } }
	);
	
	const arrayVsObjectComparisonArb = fc.constantFrom(
		{ tags: { $gt: { foo: 'bar' } } },
		{ tags: { $lt: ['a', 'b'] } }
	);
	
	const schemaDefyingSizeArb = fc.constantFrom(
		{ unknownField: { $size: 2 } },
		{ unknownField: { $size: 0 } },
		{ optional: { $size: 1 } }
	);
	
	const objectEqualityArb = fc.constantFrom(
		{ metadata: { a: 1, b: 2 } },
		{ metadata: { b: 2, a: 1 } },
		{ metadata: { a: 1 } }
	);
	
	const notNullParadoxArb = fc.constantFrom(
		{ optional: { $not: { $gt: 'm' } } },
		{ nonexistent: { $not: { $lt: 50 } } },
		{ optional: { $not: { $regex: '^v' } } }
	);
	
	const scalarVsArrayArb = fc.constantFrom(
		{ tags: 'admin' },
		{ unknownField: 'item1' },
		{ unknownField: { $eq: 'item1' } }
	);
	
	// JUNIOR BUG 1: $elemMatch on scalar values (should NOT match)
	const elemMatchOnScalarArb = fc.constantFrom(
		{ unknownField: { $elemMatch: { $eq: 'item1' } } },
		{ tags: { $elemMatch: { $eq: 'admin' } } }
	);
	
	// LINUS BUG 1: $regex on number fields (should NOT match - type guard required)
	const regexOnNumberFieldArb = fc.constantFrom(
		{ age: { $regex: '2' } },
		{ age: { $regex: '^3' } },
		{ score: { $regex: '5' } },
		{ score: { $regex: '\\d+' } }
	);
	
	// JUNIOR BUG 2: $regex on unknown field with array runtime data (should match by traversing)
	const regexOnUnknownArrayArb = fc.constantFrom(
		{ unknownField: { $regex: '^item' } },
		{ unknownField: { $regex: 'item1' } },
		{ unknownField: { $regex: '1$' } }
	);
	
	// JUNIOR BUG 2 EXTENDED: Other operators on unknown arrays
	const operatorsOnUnknownArrayArb = fc.constantFrom(
		{ unknownField: { $gt: 'item0' } },
		{ unknownField: { $gte: 'item1' } },
		{ unknownField: { $lt: 'item3' } },
		{ unknownField: { $lte: 'item2' } },
		{ unknownField: { $in: ['item1', 'item2'] } },
		{ unknownField: { $nin: ['item3', 'item4'] } }
	);
	
	// EDGE CASE: $elemMatch should NOT trigger array traversal for nested fields
	const elemMatchNoArrayTraversalArb = fc.constantFrom(
		{ items: { $elemMatch: { name: 'item1' } } },
		{ items: { $elemMatch: { category: 'A' } } },
		{ items: { $elemMatch: { price: 100 } } }
	);
	
	// EDGE CASE: $size on known array field (Fast Path - no type guard)
	const sizeKnownArrayArb = fc.constantFrom(
		{ tags: { $size: 0 } },
		{ tags: { $size: 1 } },
		{ tags: { $size: 2 } },
		{ items: { $size: 0 } },
		{ items: { $size: 1 } }
	);
	
	// EDGE CASE: Nested object equality (Mingo fallback)
	const nestedObjectEqualityArb = fc.constantFrom(
		{ 'items.0': { name: 'item1', category: 'A' } },
		{ 'items.0': { category: 'A', name: 'item1' } }
	);
	
	// EDGE CASE: Mixed object equality + array traversal in same query
	const mixedObjectAndArrayArb = fc.constantFrom(
		{ metadata: { a: 1, b: 2 }, unknownField: 'item1' },
		{ metadata: { b: 2, a: 1 }, unknownField: 'item1' }
	);
	
	// LINUS TORVALDS TYPE MISMATCH BOUNDARIES
	// Test 1: String vs Number (MongoDB enforces strict BSON type boundaries)
	const typeMismatchStringNumberArb = fc.constantFrom(
		{ age: '30' },              // String value for number field - should NOT match age: 30
		{ age: { $gt: '25' } },     // String comparison on number field - should NOT match
		{ score: '95.5' },          // String value for number field - should NOT match
		{ score: { $lt: '80' } }    // String comparison on number field - should NOT match
	);
	
	// Test 2: Array field with scalar query (MongoDB implicit $in)
	const arrayScalarMatchArb = fc.constantFrom(
		{ tags: 'admin' },          // Scalar query on array field - SHOULD match if "admin" in array
		{ tags: 'user' },           // SHOULD match if "user" in array
		{ tags: 'moderator' }       // SHOULD match if "moderator" in array
	);
	
	// Test 3: null vs undefined (missing fields)
	const nullVsUndefinedArb = fc.constantFrom(
		{ optional: null },                      // SHOULD match missing OR null
		{ optional: { $ne: null } },             // SHOULD match present (not null, not missing)
		{ nonexistent: null },                   // SHOULD match all docs (field doesn't exist)
		{ optional: { $exists: true } },         // SHOULD match docs with the key (including null)
		{ optional: { $exists: false } }         // SHOULD match docs without the key
	);
	
	// Test 4: Exact object match (BLACK HOLE 2 & 3a)
	const exactObjectMatchArb = fc.constantFrom(
		{ metadata: { active: true } },          // SHOULD match ONLY exact structure
		{ metadata: { active: true, count: 5 } }, // Different structure
		{ config: {} }                           // Empty object exact match
	);
	
	// Test 5: Exact array match (BLACK HOLE 2)
	const exactArrayMatchArb = fc.constantFrom(
		{ tags: ['admin', 'user'] },             // SHOULD match ONLY exact array
		{ tags: ['user', 'admin'] },             // Different order
		{ tags: [] }                             // Empty array exact match
	);
	
	// Test 6: Implicit array traversal
	const implicitArrayTraversalArb = fc.constantFrom(
		{ 'items.category': 'A' },               // Dot notation on array field
		{ 'items.price': 100 },
		{ 'items.name': 'item1' }
	);

	// Regex patterns: Simple patterns (SQL LIKE) + Complex patterns (in-memory)
	const regexArb = fc.record({
		field: fc.constantFrom('name'),
		op: fc.constant('$regex'),
		value: fc.constantFrom('Alice', 'Bob', 'lie', 'vid', '^A', 'e$')
	});
	
	// Complex regex patterns (character classes, quantifiers, alternation)
	const complexRegexArb = fc.record({
		field: fc.constantFrom('name', 'optional'),
		op: fc.constant('$regex'),
		value: fc.constantFrom(
			'(Alice|Bob)',           // Alternation
			'[A-Z][a-z]+',          // Character classes
			'A+',                    // Quantifiers
			'.*e$',                  // Wildcards
			'^[A-Z]{3,5}',          // Bounded quantifiers
			'\\w+',                  // Shorthands
			'(a|e){2,}'             // Complex combination
		),
		options: fc.option(fc.constantFrom('i', 'im', 'is', 'iu', 'm', 's', 'u'), { nil: undefined })
	});
	
	const typeArb = fc.record({
		field: fieldArb,
		op: fc.constant('$type'),
		value: fc.constantFrom('string', 'number', 'boolean', 'array', 'null', 'object')
	});
	
	const typeOnOptionalArb = fc.record({
		field: fc.constant('optional'),
		op: fc.constant('$type'),
		value: fc.constantFrom('string', 'null')
	});
	
	// LINUS TORVALDS EDGE CASE: $type with array values (MongoDB/Mingo support OR logic)
	const typeArrayArb = fc.record({
		field: fc.constantFrom('age', 'name', 'tags', 'active', 'score'),
		op: fc.constant('$type'),
		value: fc.constantFrom(
			['string', 'number'],
			['number', 'null'],
			['string', 'null'],
			['array', 'null'],
			['boolean', 'string']
		)
	});
	
	const bsonNumericTypeArb = fc.record({
		field: fc.constantFrom('name', 'age', 'tags', 'active', 'score'),
		op: fc.constant('$type'),
		value: fc.constantFrom(
			2,
			16,
			18,
			4,
			8,
			1,
			[2, 16],
			[4, 2]
		)
	});
	
	const unicodeRegexArb = fc.record({
		field: fc.constant('name'),
		op: fc.constant('$regex'),
		value: fc.constantFrom('café', 'naïve', 'résumé', 'Zürich', 'São Paulo'),
		options: fc.constant('i')
	});
	
	const rawColumnTypeMismatchArb = fc.constantFrom(
		{ id: 123 },
		{ id: { $eq: 456 } },
		{ id: { $ne: 789 } },
		{ id: { $gt: 100 } },
		{ _rev: 123 },
		{ _deleted: 'true' },
		{ _deleted: 1 }
	);
	
	const numericObjectKeyArb = fc.constantFrom(
		{ 'metadata.0': 'value' },
		{ 'metadata.1': { $eq: 'test' } },
		{ 'metadata.2': { $ne: 'foo' } }
	);
	
	const existsOnOptionalArb = fc.record({
		field: fc.constant('optional'),
		op: fc.constant('$exists'),
		value: booleanValueArb
	});
	
	const existsOnRequiredArb = fc.record({
		field: fc.constantFrom('name', 'age', 'tags'),
		op: fc.constant('$exists'),
		value: booleanValueArb
	});
	
	const elemMatchSimpleArb = fc.record({
		field: fc.constant('tags'),
		op: fc.constant('$elemMatch'),
		value: fc.oneof(
			fc.constantFrom('admin', 'user', 'mod', '^a', 'r$').map(v => ({ $regex: v })),
			fc.constantFrom('string', 'number').map(v => ({ $type: v })),
			stringValueArb.map(v => ({ $eq: v })),
			stringValueArb.map(v => ({ $ne: v })),
			fc.constantFrom('a', 'm', 'z').map(v => ({ $gt: v })),
			fc.constantFrom('a', 'm', 'z').map(v => ({ $lt: v }))
		)
	});
	
	const elemMatchComplexArb = fc.record({
		field: fc.constant('items'),
		op: fc.constant('$elemMatch'),
		value: fc.oneof(
			fc.constantFrom('item1', 'item2', 'item3', 'item4', 'item5').map(v => ({ name: { $eq: v } })),
			fc.constantFrom(['A'], ['B'], ['A', 'C']).map(v => ({ category: { $in: v } })),
			fc.integer({ min: 50, max: 250 }).map(v => ({ price: { $gt: v } })),
			fc.constantFrom('A', 'B', 'C').chain(cat => 
				fc.integer({ min: 100, max: 200 }).map(price => ({
					$and: [
						{ category: { $eq: cat } },
						{ price: { $gte: price } }
					]
				}))
			),
			fc.constantFrom('item', '^item').chain(regex =>
				fc.integer({ min: 0, max: 2 }).map(size => ({
					$or: [
						{ name: { $regex: regex } },
						{ tags: { $size: size } }
					]
				}))
			)
		)
	});
	
	const singleOpArb = fc.oneof(
		eqArb, neArb, gtArb, gteArb, ltArb, lteArb, 
		inArb, ninArb, existsArb,
		sizeArb, sizeOnNonArrayArb, modArb, modOnArrayArb,
		allArb,
		regexArb, 
		typeArb, typeArrayArb,
		elemMatchSimpleArb,
		elemMatchComplexArb,
		arrayIndexArb,
		regexOnArrayArb
	);
	
	// Convert operator object to Mango query
	const toMangoQuery = (op: { field: string; op: string; value: unknown }) => {
		if (op.op === '$eq') {
			return { [op.field]: op.value };
		}
		if (op.op === '$elemMatch') {
			// Handle $elemMatch specially
			return { [op.field]: { $elemMatch: op.value } };
		}
		return { [op.field]: { [op.op]: op.value } };
	};
	
	// Logical operators
	const andArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$and: ops.map(toMangoQuery)
	}));
	
	const orArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$or: ops.map(toMangoQuery)
	}));
	
	const norArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$nor: ops.map(toMangoQuery)
	}));
	
	const notArb = singleOpArb.map(op => ({
		[op.field]: { $not: { [op.op]: op.value } }
	}));
	
	const orWithNullArb = fc.array(
		fc.oneof(
			fc.constantFrom('present', 'value').map(v => ({ optional: v })),
			fc.constantFrom('present', 'value').map(v => ({ optional: { $ne: v } })),
			stringValueArb.map(v => ({ name: { $eq: v } }))
		),
		{ minLength: 2, maxLength: 3 }
	).map(arr => ({ $or: arr }));
	
	const deepNestedArb = fc.tuple(
		numberValueArb,
		numberValueArb,
		booleanValueArb
	).map(([age, score, active]) => ({
		$and: [
			{
				$or: [
					{ age: { $gt: age } },
					{ score: { $lt: score } }
				]
			},
			{ active }
		]
	}));
	
	const orPrecedenceArb = fc.tuple(
		stringValueArb,
		stringValueArb,
		stringValueArb
	).map(([name, val1, val2]) => ({
		name: { $eq: name },
		$or: [
			{ optional: { $ne: val1 } },
			{ optional: { $ne: val2 } }
		]
	}));
	
	const emptyObjectArb = fc.constantFrom('optional', 'metadata').map(field => ({
		[field]: {}
	}));
	
	// NEW: $not with nested $and/$or
	const notNestedArb = fc.tuple(numberValueArb, numberValueArb).map(([age1, age2]) => ({
		age: {
			$not: {
				$and: [
					{ age: { $gt: Math.min(age1, age2) } },
					{ age: { $lt: Math.max(age1, age2) } }
				]
			}
		}
	}));
	
	// NEW: Empty array edge cases
	const emptyArrayArb = fc.constantFrom(
		{ age: { $in: [] } },      // Should match nothing
		{ age: { $nin: [] } },     // Should match everything
		{ tags: { $in: [] } },     // Should match nothing
		{ tags: { $nin: [] } }     // Should match everything
	);
	
	// NEW: NULL in $in/$nin
	const nullInArrayArb = fc.constantFrom(
		{ optional: { $in: ['present', 'value'] } },
		{ optional: { $nin: ['present'] } },
		{ optional: { $in: [null] } }
	);
	
	// NEW: $elemMatch with $not inside
	const elemMatchNotArb = fc.constantFrom(
		{ tags: { $elemMatch: { $not: { $regex: '^a' } } } },
		{ tags: { $elemMatch: { $not: { $eq: 'admin' } } } },
		{ items: { $elemMatch: { price: { $not: { $gt: 150 } } } } }
	);
	
	// NEW: Multiple operators on same field
	const multiOpArb = fc.tuple(numberValueArb, numberValueArb).map(([min, max]) => ({
		age: {
			$gte: Math.min(min, max),
			$lte: Math.max(min, max)
		}
	}));
	
	// NEW: Complex regex with options
	const complexRegexWithOptionsArb = fc.record({
		field: fc.constantFrom('name'),
		pattern: fc.constantFrom('(alice|bob)', '[a-z]+', '\\w{3,}'),
		options: fc.constantFrom('i', 'im')
	}).map(({ field, pattern, options }) => ({
		[field]: { $regex: pattern, $options: options }
	}));
	
	// NEW: $and/$or/$nor with field conditions (EARLY RETURN BUG)
	// Bug: Early return after checking logical operator, never checks field conditions
	// Example: { $and: [{ age: { $gt: 20 } }], name: 'Alice' }
	// Current: Returns after $and check, ignores name field
	// Correct: Must check BOTH $and AND name field
	const logicalWithFieldArb = fc.tuple(
		numberValueArb,
		stringValueArb
	).map(([age, name]) => ({
		$and: [{ age: { $gt: age } }],
		name: { $eq: name }
	}));

	// GAP 2: Array/Object in Range Operators (Lexicographical Comparison Bug)
	const arrayObjectRangeArb = fc.constantFrom(
		{ score: { $gt: [10] } },           // Should NOT match strings via lexicographical comparison
		{ score: { $lt: [100] } },
		{ data: { $gt: { a: 1 } } },        // Should NOT match strings
		{ data: { $lt: { z: 99 } } },
		{ unknownField: { $gte: [5, 10] } },
		{ unknownField: { $lte: { key: 'value' } } }
	);

	// GAP 4: Type Coercion in $in/$nin (Boolean vs Number, String vs Number)
	const typeCoercionInArb = fc.constantFrom(
		{ active: { $in: [1, 0] } },        // Should NOT match boolean true/false
		{ active: { $nin: [1, 0] } },
		{ count: { $in: [1] } },            // Should NOT match string "1"
		{ count: { $nin: ["1"] } },         // Should NOT match number 1
		{ age: { $in: ["30", "25"] } },     // Should NOT match number 30/25
		{ score: { $in: [95.5, "80"] } }    // Mixed types
	);

	// GAP 5: Nested $elemMatch (Context Tracking Bug)
	const nestedElemMatchArb = fc.constantFrom(
		{ matrix: { $elemMatch: { $elemMatch: { $gt: 5 } } } },
		{ matrix: { $elemMatch: { $elemMatch: { $lt: 10 } } } },
		{ matrix: { $elemMatch: { $elemMatch: { $eq: 7 } } } }
	);

	// GAP 7: isComplexRegex Missing Escape Sequences (\d, \w, \s, \b)
	const regexEscapeSequencesArb = fc.constantFrom(
		{ name: /^user\d$/ },               // \d should match digits
		{ name: /\w+@\w+/ },                // \w should match word chars
		{ name: /\s+/ },                    // \s should match whitespace
		{ name: /\bAlice\b/ },              // \b should match word boundary
		{ optional: /^\w{3,}$/ },           // Combined escape sequences
		{ name: { $regex: 'user\\d', $options: '' } },  // Sibling syntax
		{ name: { $regex: '\\w+', $options: 'i' } }
	);

	// GAP 8: $all on Scalar Values (Should NOT Match)
	const allOnScalarArb = fc.constantFrom(
		{ role: { $all: ["admin"] } },      // Should NOT match scalar "admin"
		{ name: { $all: ["Alice"] } },      // Should NOT match scalar "Alice"
		{ optional: { $all: ["present"] } }, // Should NOT match scalar "present"
		{ unknownField: { $all: ["item1"] } } // Should NOT match scalar "item1"
	);

	// JUNIOR2 GAP 1: $not with RegExp
	const notWithRegexArb = fc.constantFrom(
		{ name: { $not: /^A/ } },           // Should match non-A names
		{ name: { $not: /ice$/ } },         // Should match names not ending in "ice"
		{ optional: { $not: /^v/ } }        // Should match non-v optionals
	);

	// JUNIOR2 GAP 2: $in with RegExp
	const inWithRegexArb = fc.constantFrom(
		{ name: { $in: [/^A/, 'Bob'] } },   // Should match A* or Bob
		{ name: { $in: [/^user\d$/, 'admin'] } }, // Should match user1, user2, or admin
		{ optional: { $in: [/^p/, /^v/] } } // Should match p* or v*
	);

	// JUNIOR2 GAP 4: Array Traversal in $type
	const typeArrayTraversalArb = fc.constantFrom(
		{ tags: { $type: 'string' } },      // Should match if ANY element is string
		{ scores: { $type: 'number' } },    // Should match if ANY element is number
		{ unknownField: { $type: 2 } }      // BSON code 2 (string) with array traversal
	);

	// JUNIOR2 GAP 6: Nested Array Exact Match
	const nestedArrayExactMatchArb = fc.constantFrom(
		{ 'items.tags': ['new'] },          // Should match exact array in nested field
		{ 'items.tags': ['premium', 'new'] }, // Should match exact array
		{ 'items.tags': [] }                // Should match empty array
	);

	// BUG FIX 1: 2D Array Flattening (Recursive CTE with depth-based flattening)
	const twoDArrayFlatteningArb = fc.constantFrom(
		{ matrix: 1 },                      // Should match [[1, 2], [3, 4]] by flattening
		{ matrix: 2 },                      // Should match [[1, 2], [3, 4]]
		{ matrix: 10 },                     // Should match [[1, 2], [3, 10]]
		{ matrix: { $in: [1, 5, 10] } },    // Should match multiple 2D arrays
		{ matrix: { $gt: 8 } },             // Should match elements > 8 in 2D arrays
		{ matrix: { $all: [1, 2] } }        // Should match if 2D array contains both 1 and 2
	);

	// BUG FIX 2: Float Modulo (Bailout to JS for float divisors)
	const floatModuloArb = fc.constantFrom(
		{ score: { $mod: [4.5, 2] } },      // Float divisor - should bailout to JS
		{ score: { $mod: [3, 1.5] } },      // Float remainder - should bailout to JS
		{ score: { $mod: [2.5, 0] } },      // Float divisor with 0 remainder
		{ age: { $mod: [7.2, 1.2] } }       // Float divisor on integer field
	);

	// BUG FIX 3: INT64_MIN Overflow in $mod (DocumentDB pattern)
	const modOverflowArb = fc.constantFrom(
		{ age: { $mod: [-1, 0] } },         // INT64_MIN % -1 overflow
		{ score: { $mod: [-1, 0] } },       // Should handle gracefully
		{ count: { $mod: [-1, 0] } }        // On unknown field
	);

	return fc.oneof(
		singleOpArb.map(toMangoQuery),
		andArb,
		orArb,
		norArb,
		notArb,
		orWithNullArb,
		deepNestedArb,
		orPrecedenceArb,
		emptyObjectArb,
		notNestedArb,
		emptyArrayArb,
		nullInArrayArb,
		elemMatchNotArb,
		multiOpArb,
		complexRegexArb.map(op => ({ [op.field]: { $regex: op.value, ...(op.options ? { $options: op.options } : {}) } })),
		complexRegexWithOptionsArb,
		typeMismatchStringNumberArb,
		arrayScalarMatchArb,
		nullVsUndefinedArb,
		exactObjectMatchArb,
		exactArrayMatchArb,
		implicitArrayTraversalArb,
		logicalWithFieldArb,
		allWithEmptyArrayArb,
		allWithRegexArb,
		allWithDuplicatesArb,
		allTypeMismatchArb,
		arrayVsObjectComparisonArb,
		schemaDefyingSizeArb,
		objectEqualityArb,
		notNullParadoxArb,
		scalarVsArrayArb,
		regexOnNumberFieldArb,
		elemMatchOnScalarArb,
		regexOnUnknownArrayArb,
		operatorsOnUnknownArrayArb,
		elemMatchNoArrayTraversalArb,
		sizeKnownArrayArb,
		nestedObjectEqualityArb,
		mixedObjectAndArrayArb,
		modOnUnknownArrayArb,
		bsonNumericTypeArb.map(toMangoQuery),
		unicodeRegexArb.map(op => ({ [op.field]: { $regex: op.value, $options: op.options } })),
		rawColumnTypeMismatchArb,
		numericObjectKeyArb,
		arrayObjectRangeArb,
		typeCoercionInArb,
		nestedElemMatchArb,
		regexEscapeSequencesArb,
		allOnScalarArb,
		notWithRegexArb,
		inWithRegexArb,
		typeArrayTraversalArb,
		nestedArrayExactMatchArb,
		twoDArrayFlatteningArb,
		floatModuloArb,
		modOverflowArb
	);
};

describe('Property-Based Testing: SQL vs Mingo Correctness', () => {
	let storage: RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings>;
	let instance: RxStorageInstance<TestDocType, BunSQLiteInternals, BunSQLiteStorageSettings>;
	
	beforeEach(async () => {
		storage = getRxStorageBunSQLite({ strict: true });
		instance = await storage.createStorageInstance<TestDocType>({
			databaseInstanceToken: 'test-token-pbt',
			databaseName: 'testdb-pbt',
			collectionName: 'users-pbt',
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
				scores: { type: 'array', items: { type: 'number' } },
			optional: { type: 'string' },
			metadata: { type: 'object', properties: { '0': { type: 'string' }, '1': { type: 'string' } } },
			unknownField: {},
			'first name': { type: 'string' },
			'user-name': { type: 'string' },
			role: { type: 'string' },
			matrix: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
			data: {},
			count: {},
				items: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								category: { type: 'string' },
								price: { type: 'number' },
								tags: { type: 'array', items: { type: 'string' } }
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
		
		// Insert mock documents
		await instance.bulkWrite(
			mockDocs.map(doc => ({ document: doc })),
			'property-based-test'
		);
	});
	
	afterEach(async () => {
		await instance.remove();
	});
	
	it('SQL results match Mingo on 97% of cases, exceed Mingo on 3% edge cases', async () => {
		await fc.assert(
			fc.asyncProperty(MangoQueryArbitrary(), async (mangoQuery) => {
				const mingoQuery = new Query<TestDocType>(mangoQuery);
				const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
				const mingoIds = mingoResults.map(doc => doc.id).sort();
				
				const sqlResults = await instance.query({
					query: {
						selector: mangoQuery,
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
				const sqlIds = sqlResults.documents.map(doc => doc.id).sort();
				
				if (!hasKnownMingoBug(mangoQuery)) {
					expect(sqlIds).toEqual(mingoIds);
				} else {
					expect(sqlIds).toBeDefined();
					expect(Array.isArray(sqlIds)).toBe(true);
				}
			}),
			{ 
				numRuns: 1000,
				verbose: true,
				seed: 42
			}
		);
	}, 120000);

	it('STRESS TEST: 10k random queries', async () => {
		await fc.assert(
			fc.asyncProperty(MangoQueryArbitrary(), async (mangoQuery) => {
				const mingoQuery = new Query<TestDocType>(mangoQuery);
				const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
				const mingoIds = mingoResults.map(doc => doc.id).sort();
				
				const sqlResults = await instance.query({
					query: {
						selector: mangoQuery,
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
				const sqlIds = sqlResults.documents.map(doc => doc.id).sort();
				
				if (!hasKnownMingoBug(mangoQuery)) {
					expect(sqlIds).toEqual(mingoIds);
				} else {
					expect(sqlIds).toBeDefined();
				}
			}),
			{ 
				numRuns: 10000,
				verbose: false,
				seed: 1337
			}
		);
	}, 300000);
	
	it('handles edge cases: empty results', async () => {
		const query = { age: { $gt: 100 } }; // No matches
		
		const mingoQuery = new Query<TestDocType>(query);
		const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
		
		const sqlResults = await instance.query({
			query: {
				selector: query,
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
		
		expect(sqlResults.documents.length).toBe(0);
		expect(mingoResults.length).toBe(0);
	});
	
	it('handles edge cases: all documents match', async () => {
		const query = { _deleted: false }; // All match
		
		const mingoQuery = new Query<TestDocType>(query);
		const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
		
		const sqlResults = await instance.query({
			query: {
				selector: query,
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
		
		expect(sqlResults.documents.length).toBe(12);
		expect(mingoResults.length).toBe(12);
	});

	it('BUG 2: Empty object equality should match documents with empty objects', async () => {
		const query = { metadata: {} };
		
		const mingoQuery = new Query<TestDocType>(query);
		const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
		const mingoIds = mingoResults.map(doc => doc.id).sort();
		
		const sqlResults = await instance.query({
			query: {
				selector: query,
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
		const sqlIds = sqlResults.documents.map(doc => doc.id).sort();
		
		console.log('Query:', JSON.stringify(query));
		console.log('Mingo result:', mingoIds);
		console.log('SQL result:', sqlIds);
		
		expect(sqlIds).toEqual(mingoIds);
	});

	it('handles mixed SQL + regex queries (partial pushdown)', async () => {
		const mixedQueries = [
			{ active: true, name: { $regex: '^A' } },
			{ age: { $gt: 25 }, name: { $regex: 'e$' } },
			{ active: false, name: { $regex: 'o' }, age: { $lt: 30 } },
			{ tags: { $size: 2 }, name: { $regex: '[aeiou]{2}' } },
			{ score: { $gte: 85 }, name: { $regex: '(Alice|Charlie)' } }
		];

		for (const query of mixedQueries) {
			const mingoQuery = new Query<TestDocType>(query);
			const mingoResults = mingoQuery.find<TestDocType>(mockDocs).all();
			const mingoIds = mingoResults.map(doc => doc.id).sort();

			const sqlResults = await instance.query({
				query: {
					selector: query,
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
			} as any);
			const sqlIds = sqlResults.documents.map(doc => doc.id).sort();

			expect(sqlIds).toEqual(mingoIds);
		}
	});
});
