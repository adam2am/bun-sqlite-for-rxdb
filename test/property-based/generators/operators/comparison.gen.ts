import fc from 'fast-check';

const fieldArb = fc.constantFrom('name', 'age', 'tags', 'active', 'score');
const stringValueArb = fc.constantFrom('Alice', 'Bob', 'Charlie', 'David', 'Eve', 'admin', 'user', 'moderator');
const numberValueArb = fc.integer({ min: 20, max: 40 });
const booleanValueArb = fc.boolean();

export const eqArb = fc.record({
	field: fieldArb,
	op: fc.constant('$eq'),
	value: fc.oneof(stringValueArb, numberValueArb, booleanValueArb)
});

export const neArb = fc.record({
	field: fieldArb,
	op: fc.constant('$ne'),
	value: fc.oneof(stringValueArb, numberValueArb, booleanValueArb)
});

export const gtArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$gt'),
	value: numberValueArb
});

export const gteArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$gte'),
	value: numberValueArb
});

export const ltArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$lt'),
	value: numberValueArb
});

export const lteArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$lte'),
	value: numberValueArb
});

export const comparisonArb = fc.oneof(eqArb, neArb, gtArb, gteArb, ltArb, lteArb);

export const multiOpArb = fc.tuple(numberValueArb, numberValueArb).map(([min, max]) => ({
	age: {
		$gte: Math.min(min, max),
		$lte: Math.max(min, max)
	}
}));
