import fc from 'fast-check';
import { HostileStringArb, HostileNumberArb } from '../hostile-primitives.gen';

export const regexArb = fc.record({
	field: fc.constantFrom('name', 'strVal'),
	op: fc.constant('$regex'),
	value: fc.oneof(
		HostileStringArb,
		fc.constantFrom('^A', 'e$', '.*', '.+', '[a-z]+', '\\d+', '\\s*')
	)
});

export const typeArb = fc.record({
	field: fc.constantFrom('name', 'age', 'tags', 'active', 'score', 'metadata', '', '0'),
	op: fc.constant('$type'),
	value: fc.constantFrom('string', 'number', 'boolean', 'array', 'null', 'object', 'date')
});

export const modArb = fc.record({
	field: fc.constantFrom('age', 'score'),
	op: fc.constant('$mod'),
	value: fc.tuple(
		fc.oneof(fc.integer({ min: 1, max: 10 }), HostileNumberArb),
		fc.oneof(fc.integer({ min: 0, max: 9 }), HostileNumberArb)
	)
});

export const existsArb = fc.record({
	field: fc.constantFrom('name', 'age', 'tags', 'active', 'score', 'optional', 'metadata', '', '0'),
	op: fc.constant('$exists'),
	value: fc.boolean()
});

export const evaluationArb = fc.oneof(regexArb, typeArb, modArb, existsArb);
