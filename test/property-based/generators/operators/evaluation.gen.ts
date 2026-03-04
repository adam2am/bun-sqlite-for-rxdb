import fc from 'fast-check';

export const regexArb = fc.record({
	field: fc.constantFrom('name'),
	op: fc.constant('$regex'),
	value: fc.constantFrom('Alice', 'Bob', 'lie', 'vid', '^A', 'e$')
});

export const typeArb = fc.record({
	field: fc.constantFrom('name', 'age', 'tags', 'active', 'score'),
	op: fc.constant('$type'),
	value: fc.constantFrom('string', 'number', 'boolean', 'array', 'null', 'object')
});

export const modArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$mod'),
	value: fc.tuple(fc.integer({ min: 2, max: 5 }), fc.integer({ min: 0, max: 4 }))
});

export const existsArb = fc.record({
	field: fc.constantFrom('name', 'age', 'tags', 'active', 'score', 'optional'),
	op: fc.constant('$exists'),
	value: fc.boolean()
});

export const evaluationArb = fc.oneof(regexArb, typeArb, modArb, existsArb);
