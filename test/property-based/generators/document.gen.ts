import fc from 'fast-check';
import { HostileStringArb, HostileNumberArb, HostileDateArb, HostileJSONArbitrary, HostilePrimitiveArb } from './hostile-primitives.gen';

export const TestDocumentArbitrary = fc.record({
	id: fc.uuid(),
	name: HostileStringArb.filter(v => v !== undefined) as fc.Arbitrary<string>,
	age: fc.oneof(
		HostileNumberArb,
		fc.constant(null),
		fc.constant(false),
		fc.constant(true)
	),
	active: fc.oneof(
		fc.boolean(),
		fc.constant(0),
		fc.constant(1),
		fc.constant(null)
	),
	count: fc.oneof(
		fc.integer({ min: 0, max: 1000 }),
		fc.constant("1"),
		HostileNumberArb
	),
	score: HostileNumberArb,
	scores: fc.option(fc.array(HostileNumberArb, { minLength: 2, maxLength: 3 })),
	optional: fc.option(HostileStringArb),
	tags: fc.oneof(
		fc.array(HostileStringArb, { maxLength: 3 }),
		fc.constant([]),
		fc.constant(['admin', 'user'])
	),
	items: fc.array(
		fc.record({
			name: HostileStringArb,
			category: fc.constantFrom('A', 'B', 'C', null),
			price: HostileNumberArb,
			tags: fc.array(HostileStringArb, { maxLength: 3 })
		}),
		{ maxLength: 5 }
	),
	'first name': fc.option(HostileStringArb),
	'user-name': fc.option(HostileStringArb),
	'': fc.option(HostileStringArb),
	'0': fc.option(HostileNumberArb),
	role: fc.option(fc.constantFrom('admin', 'user', 'moderator')),
	matrix: fc.option(fc.array(fc.array(HostileNumberArb, { maxLength: 3 }), { maxLength: 3 })),
	data: fc.option(HostilePrimitiveArb),
	unknownField: fc.option(fc.oneof(
		fc.array(HostileStringArb, { minLength: 1, maxLength: 2 }),
		HostileStringArb
	)),
	strVal: fc.option(HostileStringArb),
	metadata: HostileJSONArbitrary.object,
	createdAt: fc.option(HostileDateArb),
	_deleted: fc.constant(false),
	_attachments: fc.constant({}),
	_rev: fc.string(),
	_meta: fc.record({
		lwt: fc.integer({ min: 0, max: Date.now() })
	})
});
