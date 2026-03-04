import fc from 'fast-check';

export const TestDocumentArbitrary = fc.record({
	id: fc.uuid(),
	name: fc.oneof(
		fc.string({ minLength: 1, maxLength: 50 }),
		fc.constant('Alice'),
		fc.constant('Bob'),
		fc.constant('Charlie'),
		fc.constant('Café'),
		fc.constant('50%'),
		fc.constant('user_name')
	),
	age: fc.oneof(
		fc.integer({ min: 0, max: 100 }),
		fc.constant(-9223372036854775808),
		fc.constant(0),
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
		fc.constant("1")
	),
	score: fc.oneof(
		fc.integer({ min: 0, max: 100 }),
		fc.double({ min: 0, max: 100 }),
		fc.constant(-9223372036854775808)
	),
	scores: fc.option(fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 3 })),
	optional: fc.option(fc.constantFrom('present', 'value')),
	tags: fc.oneof(
		fc.array(fc.constantFrom('admin', 'user', 'moderator', 'test'), { maxLength: 3 }),
		fc.constant([]),
		fc.constant(['admin', 'user'])
	),
	items: fc.array(
		fc.record({
			name: fc.string(),
			category: fc.constantFrom('A', 'B', 'C'),
			price: fc.integer({ min: 0, max: 1000 }),
			tags: fc.oneof(
				fc.array(fc.constantFrom('new', 'sale', 'premium', 'clearance'), { maxLength: 2 }),
				fc.constant([])
			)
		}),
		{ maxLength: 3 }
	),
	'first name': fc.option(fc.constantFrom('Alice', 'Bob')),
	'user-name': fc.option(fc.constantFrom('bob123', 'alice456')),
	role: fc.option(fc.constantFrom('admin', 'user', 'moderator')),
	matrix: fc.option(fc.array(fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 2, maxLength: 2 }), { minLength: 2, maxLength: 2 })),
	data: fc.option(fc.oneof(fc.constantFrom('admin', 'user'), fc.integer({ min: 0, max: 100 }))),
	unknownField: fc.option(fc.oneof(
		fc.array(fc.constantFrom('item1', 'item2'), { minLength: 1, maxLength: 2 }),
		fc.constantFrom('item1', 'item2')
	)),
	strVal: fc.option(fc.constantFrom('Line1\nLine2', '50%', 'test_')),
	metadata: fc.option(fc.oneof(
		fc.record({ '0': fc.constant('value0'), '1': fc.constant('value1') }),
		fc.record({ a: fc.constant(1), b: fc.constant(2) }),
		fc.constant({})
	)),
	_deleted: fc.constant(false),
	_attachments: fc.constant({}),
	_rev: fc.string(),
	_meta: fc.record({
		lwt: fc.integer({ min: 0, max: Date.now() })
	})
});
