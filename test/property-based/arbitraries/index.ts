import fc from 'fast-check';
import { comparisonArb, multiOpArb } from './comparison';
import { arrayArb, inSameTypeStringsArb, inSameTypeNumbersArb, inSameTypeBooleansArb } from './array';
import { evaluationArb } from './evaluation';
import { edgeCaseArb } from './edge-cases';
import { createLogicalArbs } from './logical';

const toMangoQuery = (op: { field: string; op: string; value: unknown }) => {
	if (op.op === '$eq') {
		return { [op.field]: op.value };
	}
	if (op.op === '$elemMatch') {
		return { [op.field]: { $elemMatch: op.value } };
	}
	return { [op.field]: { [op.op]: op.value } };
};

const singleOpArb = fc.oneof(
	comparisonArb,
	arrayArb,
	evaluationArb
);

const { andArb, orArb, norArb, notArb, deepNestedArb, logicalWithFieldArb, logicalArb } = createLogicalArbs(singleOpArb, toMangoQuery);

export const MangoQueryArbitrary = () => {
	return fc.oneof(
		singleOpArb.map(toMangoQuery),
		andArb,
		orArb,
		norArb,
		notArb,
		deepNestedArb,
		logicalWithFieldArb,
		multiOpArb,
		inSameTypeStringsArb,
		inSameTypeNumbersArb,
		inSameTypeBooleansArb,
		edgeCaseArb
	);
};
