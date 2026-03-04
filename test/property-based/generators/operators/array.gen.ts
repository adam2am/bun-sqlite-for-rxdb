import fc from 'fast-check';

const stringValueArb = fc.constantFrom('Alice', 'Bob', 'Charlie', 'David', 'Eve', 'admin', 'user', 'moderator');
const numberValueArb = fc.integer({ min: 20, max: 40 });

export const inArb = fc.record({
	field: fc.constantFrom('name', 'age', 'tags', 'active', 'score'),
	op: fc.constant('$in'),
	value: fc.array(fc.oneof(stringValueArb, numberValueArb), { minLength: 1, maxLength: 3 })
});

export const ninArb = fc.record({
	field: fc.constantFrom('name', 'age', 'tags', 'active', 'score'),
	op: fc.constant('$nin'),
	value: fc.array(fc.oneof(stringValueArb, numberValueArb), { minLength: 1, maxLength: 3 })
});

export const allArb = fc.record({
	field: fc.constant('tags'),
	op: fc.constant('$all'),
	value: fc.array(fc.constantFrom('admin', 'user', 'moderator'), { minLength: 1, maxLength: 2 })
});

export const sizeArb = fc.record({
	field: fc.constant('tags'),
	op: fc.constant('$size'),
	value: fc.integer({ min: 0, max: 3 })
});

export const arrayArb = fc.oneof(inArb, ninArb, allArb, sizeArb);
