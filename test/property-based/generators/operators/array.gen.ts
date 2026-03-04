import fc from 'fast-check';
import { HostileStringArb, HostileNumberArb, HostilePrimitiveArb } from '../hostile-primitives.gen';

export const inArb = fc.record({
	field: fc.constantFrom('name', 'age', 'tags', 'active', 'score', '', '0'),
	op: fc.constant('$in'),
	value: fc.array(HostilePrimitiveArb, { minLength: 1, maxLength: 5 })
});

export const ninArb = fc.record({
	field: fc.constantFrom('name', 'age', 'tags', 'active', 'score', '', '0'),
	op: fc.constant('$nin'),
	value: fc.array(HostilePrimitiveArb, { minLength: 1, maxLength: 5 })
});

export const allArb = fc.record({
	field: fc.constant('tags'),
	op: fc.constant('$all'),
	value: fc.array(HostileStringArb, { minLength: 1, maxLength: 3 })
});

export const sizeArb = fc.record({
	field: fc.constant('tags'),
	op: fc.constant('$size'),
	value: fc.integer({ min: 0, max: 5 })
});

export const arrayArb = fc.oneof(inArb, ninArb, allArb, sizeArb);
