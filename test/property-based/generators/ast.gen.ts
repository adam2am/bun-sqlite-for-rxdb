import fc from 'fast-check';

const fieldArb = fc.constantFrom('name', 'age', 'tags', 'active', 'score');
const stringValueArb = fc.constantFrom('Alice', 'Bob', 'Charlie', 'David', 'Eve');
const numberValueArb = fc.integer({ min: 20, max: 40 });
const booleanValueArb = fc.boolean();
const valueArb = fc.oneof(stringValueArb, numberValueArb, booleanValueArb, fc.constant(null));

export const MangoASTGenerator = fc.letrec(tie => ({
	query: fc.oneof(
		{ depthSize: 'small' },
		tie('comparison'),
		tie('logical')
	),
	
	comparison: fc.oneof(
		fc.tuple(fieldArb, valueArb).map(([field, value]) => ({ [field]: { $eq: value } })),
		fc.tuple(fieldArb, valueArb).map(([field, value]) => ({ [field]: { $ne: value } })),
		numberValueArb.map(value => ({ age: { $gt: value } })),
		numberValueArb.map(value => ({ age: { $gte: value } })),
		numberValueArb.map(value => ({ age: { $lt: value } })),
		numberValueArb.map(value => ({ age: { $lte: value } })),
		fc.array(stringValueArb, { minLength: 1, maxLength: 3 }).map(values => ({ name: { $in: values } })),
		fc.array(fc.constantFrom('admin', 'user'), { minLength: 1, maxLength: 2 }).map(values => ({ tags: { $all: values } }))
	),
	
	logical: fc.oneof(
		fc.array(tie('query'), { minLength: 2, maxLength: 3 }).map(queries => ({ $and: queries })),
		fc.array(tie('query'), { minLength: 2, maxLength: 3 }).map(queries => ({ $or: queries })),
		fc.array(tie('query'), { minLength: 2, maxLength: 3 }).map(queries => ({ $nor: queries }))
	)
}));
