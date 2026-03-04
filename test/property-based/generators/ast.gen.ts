import fc from 'fast-check';
import { HostilePrimitiveArb, HostileDateArb, HostileStringArb, HostileNumberArb } from './hostile-primitives.gen';

// HOSTILE FIELDS: Query the dangerous fields that documents contain
const HostileFieldArb = fc.constantFrom(
	// Safe fields (baseline)
	'name', 'age', 'score', 'tags', 'active',
	// HOSTILE: Date field (GAP 6: Date vs String ambiguity)
	'createdAt',
	// HOSTILE: Empty key (GAP 1)
	'',
	// HOSTILE: Numeric key (GAP 2: Array index vs Object key)
	'0',
	// HOSTILE: Recursive object
	'metadata',
	// HOSTILE: Deep traversal with dots
	'metadata.nested.dot.key',
	// HOSTILE: Array index traversal (GAP 1: "field.0" ambiguity)
	'items.0.price',
	// HOSTILE: Unknown field type
	'unknownField',
	// HOSTILE: Dot notation on arrays
	'items.tags'
);

export const MangoASTGenerator = fc.letrec(tie => ({
	query: fc.oneof(
		{ depthSize: 'small' },
		tie('comparison'),
		tie('logical'),
		tie('edgeCase')
	),
	
	comparison: fc.oneof(
		// Basic comparisons with HOSTILE values
		fc.tuple(HostileFieldArb, HostilePrimitiveArb).map(([f, v]) => ({ [f]: { $eq: v } })),
		fc.tuple(HostileFieldArb, HostilePrimitiveArb).map(([f, v]) => ({ [f]: { $ne: v } })),
		
		// Range queries with HOSTILE numbers
		fc.tuple(HostileFieldArb, HostileNumberArb).map(([f, v]) => ({ [f]: { $gt: v } })),
		fc.tuple(HostileFieldArb, HostileNumberArb).map(([f, v]) => ({ [f]: { $gte: v } })),
		fc.tuple(HostileFieldArb, HostileNumberArb).map(([f, v]) => ({ [f]: { $lt: v } })),
		fc.tuple(HostileFieldArb, HostileNumberArb).map(([f, v]) => ({ [f]: { $lte: v } })),
		
		// Date range queries (GAP 6: Date objects in queries)
		fc.tuple(HostileFieldArb, HostileDateArb).map(([f, v]) => ({ [f]: { $lte: v } })),
		
		// $in with HOSTILE values
		fc.tuple(HostileFieldArb, fc.array(HostilePrimitiveArb, { minLength: 1, maxLength: 3 })).map(([f, v]) => ({ [f]: { $in: v } })),
		
		// Regex (forces JS fallback)
		fc.tuple(HostileFieldArb, HostileStringArb).map(([f, v]) => ({ [f]: { $regex: v } })),
		
		// $all with hostile values
		fc.tuple(fc.constantFrom('tags', 'items.tags'), fc.array(HostileStringArb, { minLength: 1, maxLength: 2 })).map(([f, v]) => ({ [f]: { $all: v } }))
	),
	
	// Edge cases from junior's feedback
	edgeCase: fc.oneof(
		// GAP 2: $type operator array traversal
		fc.tuple(fc.constantFrom('tags', 'items'), fc.constantFrom('string', 'number', 'array', 'object'))
			.map(([f, v]) => ({ [f]: { $type: v } })),
		
		// GAP 3: $exists vs null vs undefined matrix
		fc.tuple(fc.constantFrom('optional', 'strVal', 'data'), fc.oneof(
			fc.constant(null),
			fc.constant({ $exists: true }),
			fc.constant({ $exists: false }),
			fc.constant({ $ne: null })
		)).map(([f, v]) => ({ [f]: v })),
		
		// GAP 4: Multiline regex anchors
		fc.tuple(fc.constantFrom('strVal', 'name'), fc.oneof(
			fc.constant({ $regex: '^Line2', $options: 'm' }),
			fc.constant({ $regex: '^admin', $options: 'i' }),
			fc.constant({ $regex: '.*', $options: 'ms' })
		)).map(([f, v]) => ({ [f]: v })),
		
		// GAP 1: Numeric key ambiguity (unknownField.0)
		fc.constant({ 'unknownField.0': { $eq: 'apple' } })
	),
	
	logical: fc.oneof(
		fc.array(tie('query'), { minLength: 2, maxLength: 3 }).map(queries => ({ $and: queries })),
		fc.array(tie('query'), { minLength: 2, maxLength: 3 }).map(queries => ({ $or: queries })),
		fc.array(tie('query'), { minLength: 2, maxLength: 3 }).map(queries => ({ $nor: queries }))
	)
}));
