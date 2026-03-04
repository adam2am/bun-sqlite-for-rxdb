export interface MingoQuirk {
	name: string;
	description: string;
	detector: (query: unknown, fieldName?: string) => boolean;
}

const QUIRKS: MingoQuirk[] = [
	{
		name: 'BIGINT_NOT_SUPPORTED',
		description: 'Mingo does not support BigInt values',
		detector: (val) => typeof val === 'bigint'
	},
	{
		name: 'REGEXP_IN_ARRAYS',
		description: 'Mingo has issues with RegExp in $in/$nin arrays',
		detector: (val) => {
			if (val && typeof val === 'object') {
				const obj = val as Record<string, unknown>;
				if (obj.$in && Array.isArray(obj.$in) && obj.$in.some((v: unknown) => v instanceof RegExp)) return true;
				if (obj.$nin && Array.isArray(obj.$nin) && obj.$nin.some((v: unknown) => v instanceof RegExp)) return true;
			}
			return false;
		}
	},
	{
		name: 'MOD_OPERATOR',
		description: 'Mingo has quirks with $mod operator',
		detector: (val) => {
			if (val && typeof val === 'object') {
				const obj = val as Record<string, unknown>;
				return obj.$mod !== undefined && Array.isArray(obj.$mod);
			}
			return false;
		}
	},
	{
		name: 'UNSUPPORTED_TOP_LEVEL_OPS',
		description: 'Operators like $text, $where, $expr, $jsonSchema, $comment are unsupported',
		detector: (val) => {
			if (val && typeof val === 'object') {
				const keys = Object.keys(val);
				return keys.some(k => ['$text', '$where', '$expr', '$jsonSchema', '$comment'].includes(k));
			}
			return false;
		}
	},
	{
		name: 'TOP_LEVEL_NOT',
		description: 'Mingo rejects top-level $not, we support it (extension)',
		detector: (val) => {
			if (val && typeof val === 'object') {
				return Object.keys(val).includes('$not');
			}
			return false;
		}
	},
	{
		name: 'MATRIX_FIELD_OPERATORS',
		description: 'Mingo has issues with comparison operators on matrix field',
		detector: (val: unknown, fieldName?: string) => {
			if (fieldName === 'matrix' && val && typeof val === 'object') {
				const obj = val as Record<string, unknown>;
				return obj.$gt !== undefined || obj.$gte !== undefined ||
					obj.$lt !== undefined || obj.$lte !== undefined ||
					obj.$all !== undefined || obj.$in !== undefined;
			}
			return false;
		}
	},
	{
		name: 'IMPLICIT_OBJECT_QUERY',
		description: 'Mingo allows partial object matches; we require exact matches (MongoDB behavior)',
		detector: (val: unknown) => {
			if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof RegExp)) {
				const keys = Object.keys(val);
				if (keys.length > 0 && !keys.some(k => k.startsWith('$'))) {
					return true;
				}
			}
			return false;
		}
	},
	{
		name: 'EMPTY_ARRAY_DOT_NOTATION',
		description: 'Mingo has issues with empty arrays in dot notation queries',
		detector: (val: unknown, fieldName?: string) => {
			return Array.isArray(val) && val.length === 0 && (fieldName?.includes('.') ?? false);
		}
	},
	{
		name: 'MIXED_TYPE_IN_OPERATOR',
		description: 'Mingo hashString fails when $in/$nin contains null or when comparing primitives against undefined document fields',
		detector: (val) => {
			if (val && typeof val === 'object') {
				const obj = val as Record<string, unknown>;
				const hasPrimitiveOrNull = (arr: unknown[]) => 
					arr.some((v: unknown) => v === null || typeof v === 'number' || typeof v === 'boolean');
				
				if (obj.$in && Array.isArray(obj.$in) && hasPrimitiveOrNull(obj.$in)) return true;
				if (obj.$nin && Array.isArray(obj.$nin) && hasPrimitiveOrNull(obj.$nin)) return true;
			}
			return false;
		}
	},
	{
		name: 'INVALID_REGEX_PATTERN',
		description: 'Mingo does not validate regex patterns before compiling',
		detector: (val) => {
			if (val && typeof val === 'object') {
				const obj = val as Record<string, unknown>;
				if (obj.$regex && typeof obj.$regex === 'string') {
					try {
						new RegExp(obj.$regex);
						return false;
					} catch {
						return true;
					}
				}
			}
			return false;
		}
	},
	{
		name: 'ALL_NESTED_ARRAY_PATH',
		description: 'Mingo $all does not flatten nested array paths (items.tags) like MongoDB does',
		detector: (val: unknown, fieldName?: string) => {
			if (fieldName?.includes('.') && val && typeof val === 'object') {
				const obj = val as Record<string, unknown>;
				return obj.$all !== undefined && Array.isArray(obj.$all);
			}
			return false;
		}
	}
];

export function hasKnownMingoQuirk(query: unknown): boolean {
	const checkValue = (val: unknown, isTopLevel = false, fieldName?: string): boolean => {
		if (val instanceof RegExp) return true;

		for (const quirk of QUIRKS) {
			if (quirk.name === 'IMPLICIT_OBJECT_QUERY' && isTopLevel) continue;
			if (quirk.detector(val, fieldName)) return true;
		}

		if (Array.isArray(val)) {
			return val.some(v => checkValue(v, false));
		}

		if (val && typeof val === 'object' && !Array.isArray(val)) {
			const obj = val as Record<string, unknown>;
			const keys = Object.keys(obj);

			if (isTopLevel) {
				for (const key of keys) {
					if (!key.startsWith('$')) {
						const fieldVal = obj[key];
						if (checkValue(fieldVal, false, key)) return true;
					}
					if (checkValue(obj[key], false, key)) return true;
				}
			} else {
				return Object.values(obj).some(v => checkValue(v, false));
			}
		}

		return false;
	};

	return checkValue(query, true);
}

export function getQuirkDetails(query: unknown): MingoQuirk[] {
	const detected: MingoQuirk[] = [];

	const checkValue = (val: unknown, fieldName?: string) => {
		for (const quirk of QUIRKS) {
			if (quirk.detector(val, fieldName)) {
				if (!detected.find(q => q.name === quirk.name)) {
					detected.push(quirk);
				}
			}
		}

		if (Array.isArray(val)) {
			val.forEach(v => checkValue(v));
		} else if (val && typeof val === 'object' && !(val instanceof RegExp)) {
			Object.entries(val).forEach(([key, value]) => {
				checkValue(value, key.startsWith('$') ? undefined : key);
			});
		}
	};

	checkValue(query);
	return detected;
}
