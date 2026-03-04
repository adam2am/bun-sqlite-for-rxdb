import fc from 'fast-check';

/**
 * Comparison Operators: $eq, $ne, $gt, $gte, $lt, $lte
 * 
 * These operators compare field values using standard comparison logic.
 * MongoDB/Mingo enforce strict type boundaries (no coercion).
 */

const fieldArb = fc.constantFrom('name', 'age', 'tags', 'active', 'score');
const stringValueArb = fc.constantFrom('Alice', 'Bob', 'Charlie', 'David', 'Eve', 'admin', 'user', 'moderator');
const numberValueArb = fc.integer({ min: 20, max: 40 });
const booleanValueArb = fc.boolean();

// $eq: Equality (supports all types)
export const eqArb = fc.record({
	field: fieldArb,
	op: fc.constant('$eq'),
	value: fc.oneof(stringValueArb, numberValueArb, booleanValueArb)
});

// $ne: Not Equal (supports all types)
export const neArb = fc.record({
	field: fieldArb,
	op: fc.constant('$ne'),
	value: fc.oneof(stringValueArb, numberValueArb, booleanValueArb)
});

// $gt: Greater Than (numbers only)
export const gtArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$gt'),
	value: numberValueArb
});

// $gte: Greater Than or Equal (numbers only)
export const gteArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$gte'),
	value: numberValueArb
});

// $lt: Less Than (numbers only)
export const ltArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$lt'),
	value: numberValueArb
});

// $lte: Less Than or Equal (numbers only)
export const lteArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$lte'),
	value: numberValueArb
});

// Combined: All comparison operators
export const comparisonArb = fc.oneof(
	eqArb,
	neArb,
	gtArb,
	gteArb,
	ltArb,
	lteArb
);

// Edge Cases: Type Mismatches (Linus Torvalds Type Boundaries)
export const typeMismatchStringNumberArb = fc.constantFrom(
	{ age: '30' },              // String value for number field - should NOT match age: 30
	{ age: { $gt: '25' } },     // String comparison on number field - should NOT match
	{ score: '95.5' },          // String value for number field - should NOT match
	{ score: { $lt: '80' } }    // String comparison on number field - should NOT match
);

// Edge Cases: Multiple operators on same field (range queries)
export const multiOpArb = fc.tuple(numberValueArb, numberValueArb).map(([min, max]) => ({
	age: {
		$gte: Math.min(min, max),
		$lte: Math.max(min, max)
	}
}));
