import fc from 'fast-check';
import { HostileStringArb, HostileNumberArb, HostilePrimitiveArb } from '../hostile-primitives.gen';

const fieldArb = fc.constantFrom('name', 'age', 'tags', 'active', 'score', '', '0', 'first name');

export const eqArb = fc.record({
	field: fieldArb,
	op: fc.constant('$eq'),
	value: HostilePrimitiveArb
});

export const neArb = fc.record({
	field: fieldArb,
	op: fc.constant('$ne'),
	value: HostilePrimitiveArb
});

export const gtArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$gt'),
	value: HostileNumberArb
});

export const gteArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$gte'),
	value: HostileNumberArb
});

export const ltArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$lt'),
	value: HostileNumberArb
});

export const lteArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$lte'),
	value: HostileNumberArb
});

export const comparisonArb = fc.oneof(eqArb, neArb, gtArb, gteArb, ltArb, lteArb);

export const multiOpArb = fc.tuple(HostileNumberArb, HostileNumberArb).map(([min, max]) => ({
	age: {
		$gte: typeof min === 'number' && typeof max === 'number' ? Math.min(min, max) : min,
		$lte: typeof min === 'number' && typeof max === 'number' ? Math.max(min, max) : max
	}
}));
