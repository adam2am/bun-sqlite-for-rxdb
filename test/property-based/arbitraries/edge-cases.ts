import fc from 'fast-check';

export const typeMismatchStringNumberArb = fc.constantFrom(
	{ age: '30' },
	{ age: { $gt: '25' } },
	{ score: '95.5' },
	{ score: { $lt: '80' } }
);

export const arrayScalarMatchArb = fc.constantFrom(
	{ tags: 'admin' },
	{ tags: 'user' },
	{ tags: 'moderator' }
);

export const nullVsUndefinedArb = fc.constantFrom(
	{ optional: null },
	{ optional: { $ne: null } },
	{ nonexistent: null },
	{ optional: { $exists: true } },
	{ optional: { $exists: false } }
);

export const exactObjectMatchArb = fc.constantFrom(
	{ metadata: { active: true } },
	{ metadata: { active: true, count: 5 } },
	{ config: {} }
);

export const exactArrayMatchArb = fc.constantFrom(
	{ tags: ['admin', 'user'] },
	{ tags: ['user', 'admin'] },
	{ tags: [] }
);

export const objectEqualityArb = fc.constantFrom(
	{ metadata: { a: 1, b: 2 } },
	{ metadata: { b: 2, a: 1 } },
	{ metadata: { a: 1 } }
);

export const regexOnNumberFieldArb = fc.constantFrom(
	{ age: { $regex: '2' } },
	{ age: { $regex: '^3' } },
	{ score: { $regex: '5' } },
	{ score: { $regex: '\\d+' } }
);

export const elemMatchOnScalarArb = fc.constantFrom(
	{ unknownField: { $elemMatch: { $eq: 'item1' } } },
	{ tags: { $elemMatch: { $eq: 'admin' } } }
);

export const allWithEmptyArrayArb = fc.constantFrom(
	{ tags: { $all: [] } },
	{ items: { $all: [] } }
);

export const allOnScalarArb = fc.constantFrom(
	{ role: { $all: ["admin"] } },
	{ name: { $all: ["Alice"] } },
	{ optional: { $all: ["present"] } },
	{ unknownField: { $all: ["item1"] } }
);

export const emptyArrayArb = fc.constantFrom(
	{ age: { $in: [] } },
	{ age: { $nin: [] } },
	{ tags: { $in: [] } },
	{ tags: { $nin: [] } }
);

export const twoDArrayFlatteningArb = fc.constantFrom(
	{ matrix: 1 },
	{ matrix: 2 },
	{ matrix: 10 },
	{ matrix: { $in: [1, 5, 10] } },
	{ matrix: { $gt: 8 } },
	{ matrix: { $all: [1, 2] } }
);

export const floatModuloArb = fc.constantFrom(
	{ score: { $mod: [4.5, 2] } },
	{ score: { $mod: [3, 1.5] } },
	{ score: { $mod: [2.5, 0] } },
	{ age: { $mod: [7.2, 1.2] } }
);

export const bigIntSafeRangeHappyArb = fc.constantFrom(
	{ age: 9007199254740991n },
	{ age: { $eq: 1152921504606846976n } },
	{ age: { $gt: 1000000000000n } },
	{ age: { $in: [100n, 200n, 300n] } }
);

export const bigIntTypeMismatchUnhappyArb = fc.constantFrom(
	{ age: 30n },
	{ age: { $eq: 25n } },
	{ score: { $gt: 80n } }
);

export const unsupportedTopLevelOpsUnhappyArb = fc.constantFrom(
	{ $text: { $search: 'Alice' } },
	{ $where: 'this.age > 25' },
	{ $comment: 'test query' },
	{ $expr: { $gt: ['$age', 25] } },
	{ $jsonSchema: { type: 'object' } }
);

export const edgeCaseArb = fc.oneof(
	typeMismatchStringNumberArb,
	arrayScalarMatchArb,
	nullVsUndefinedArb,
	exactObjectMatchArb,
	exactArrayMatchArb,
	objectEqualityArb,
	regexOnNumberFieldArb,
	elemMatchOnScalarArb,
	allWithEmptyArrayArb,
	allOnScalarArb,
	emptyArrayArb,
	twoDArrayFlatteningArb,
	floatModuloArb,
	bigIntSafeRangeHappyArb,
	bigIntTypeMismatchUnhappyArb,
	unsupportedTopLevelOpsUnhappyArb
);
