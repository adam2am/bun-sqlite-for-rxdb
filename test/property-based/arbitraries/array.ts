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

export const elemMatchSimpleArb = fc.record({
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

export const elemMatchComplexArb = fc.record({
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

export const inSameTypeStringsArb = fc.constantFrom(
	{ name: { $in: ['Alice', 'Bob', 'Charlie'] } },
	{ name: { $in: ['Eve'] } },
	{ role: { $in: ['admin', 'user', 'moderator'] } }
);

export const inSameTypeNumbersArb = fc.constantFrom(
	{ age: { $in: [25, 30, 35] } },
	{ age: { $in: [22] } },
	{ score: { $in: [80, 85, 90, 95] } }
);

export const inSameTypeBooleansArb = fc.constantFrom(
	{ active: { $in: [true] } },
	{ active: { $in: [false] } },
	{ active: { $in: [true, false] } }
);

export const arrayArb = fc.oneof(
	inArb,
	ninArb,
	allArb,
	sizeArb,
	elemMatchSimpleArb,
	elemMatchComplexArb
);
