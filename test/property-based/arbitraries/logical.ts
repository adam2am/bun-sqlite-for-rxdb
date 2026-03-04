import fc from 'fast-check';
import type { Arbitrary } from 'fast-check';

interface OperatorRecord {
	field: string;
	op: string;
	value: unknown;
}

export const createLogicalArbs = (
	singleOpArb: Arbitrary<OperatorRecord>, 
	toMangoQuery: (op: OperatorRecord) => Record<string, unknown>
) => {
	const andArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$and: ops.map(toMangoQuery)
	}));

	const orArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$or: ops.map(toMangoQuery)
	}));

	const norArb = fc.array(singleOpArb, { minLength: 2, maxLength: 3 }).map(ops => ({
		$nor: ops.map(toMangoQuery)
	}));

	const notArb = singleOpArb.map(op => ({
		[op.field]: { $not: { [op.op]: op.value } }
	}));

	const deepNestedArb = fc.tuple(
		fc.integer({ min: 20, max: 40 }),
		fc.integer({ min: 20, max: 40 }),
		fc.boolean()
	).map(([age, score, active]) => ({
		$and: [
			{
				$or: [
					{ age: { $gt: age } },
					{ score: { $lt: score } }
				]
			},
			{ active }
		]
	}));

	const logicalWithFieldArb = fc.tuple(
		fc.integer({ min: 20, max: 40 }),
		fc.constantFrom('Alice', 'Bob', 'Charlie')
	).map(([age, name]) => ({
		$and: [{ age: { $gt: age } }],
		name: { $eq: name }
	}));

	return {
		andArb,
		orArb,
		norArb,
		notArb,
		deepNestedArb,
		logicalWithFieldArb,
		logicalArb: fc.oneof(andArb, orArb, norArb, notArb)
	};
};
