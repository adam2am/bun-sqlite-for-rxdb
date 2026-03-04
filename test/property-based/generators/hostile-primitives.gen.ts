import fc from 'fast-check';

// GAP 1, 2, 3, 4: Hostile Strings
// - Empty strings, null bytes, dots, dollars, unicode, SQLi vectors
export const HostileStringArb = fc.oneof(
	fc.string({ maxLength: 20 }),
	fc.constant(""),
	fc.constant("a.b"), // Dot notation confusion
	fc.constant("$illegal"), // Operator confusion
	fc.constant("Alice\u0000Bob"), // Null byte truncation test
	fc.constant("CAFÉ"), // Unicode case-insensitivity test
	fc.constant("café"),
	fc.constant("'; DROP TABLE users; --"), // SQLi test
	fc.constant("100%"), // Regex wildcard escaping test
	fc.constant("100_"),
	fc.constant("0"), // Numeric string (GAP 2: dot vs index ambiguity)
);

// GAP 7, 8, 9: Hostile Numbers
// - Negative zero (survives JSON as 0)
// - NaN/Infinity REMOVED: JSON.stringify converts them to null (false positives)
export const HostileNumberArb = fc.oneof(
	fc.integer({ min: -1000, max: 1000 }),
	fc.double({ noNaN: true, noDefaultInfinity: true }), // CRITICAL FIX: Prevent JSON serialization artifacts
	fc.constant(-0), // Negative zero
);

// GAP 9: BigInt (precision loss in JSON)
export const HostileBigIntArb = fc.oneof(
	fc.constant(-9223372036854775808n),
	fc.constant(9223372036854775807n),
	fc.bigInt({ min: -9007199254740991n, max: 9007199254740991n }) // Safe integer range
);

// GAP 6: Date vs String ambiguity
export const HostileDateArb = fc.oneof(
	fc.date({ min: new Date(1970, 0, 1), max: new Date(2100, 11, 31) }),
	fc.date({ min: new Date(1970, 0, 1), max: new Date(2100, 11, 31) })
		.filter(d => !isNaN(d.getTime()))
		.map(d => d.toISOString())
);

// GAP 12: Year 10,000 problem (dates beyond 9999)
export const ExtremeDateArb = fc.oneof(
	fc.constant(new Date('0999-12-31')), // Year < 1000
	fc.constant(new Date('9999-12-31')), // Year = 9999
	fc.constant('0999-12-31T00:00:00.000Z'), // ISO string year < 1000
	fc.constant('9999-12-31T23:59:59.999Z'), // ISO string year = 9999
);

// Combined primitive for general use
export const HostilePrimitiveArb = fc.oneof(
	HostileStringArb,
	HostileNumberArb,
	fc.boolean(),
	fc.constant(null),
	HostileDateArb
);

// GAP 11: Deep nesting (stack overflow test)
// Recursive JSON with controlled depth
export const HostileJSONArbitrary = fc.letrec(tie => ({
	value: fc.oneof(
		{ depthSize: 'small' },
		HostileStringArb,
		HostileNumberArb,
		fc.boolean(),
		fc.constant(null),
		HostileDateArb,
		tie('array'),
		tie('object')
	),
	array: fc.array(tie('value'), { maxLength: 5 }),
	object: fc.dictionary(
		fc.oneof(
			fc.string({ maxLength: 5 }),
			fc.constant(""), // GAP 1: Empty key
			fc.constant("0"), // GAP 2: Numeric key vs array index
			fc.constant("nested.dot.key") // Dot in key name
		),
		tie('value'),
		{ maxKeys: 5 }
	)
}));
