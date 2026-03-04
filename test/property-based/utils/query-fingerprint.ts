export function fingerprintQuery(query: unknown): string {
	const abstractTypes = (key: string, val: unknown): unknown => {
		if (typeof val === 'number') return '<num>';
		if (typeof val === 'string') return '<str>';
		if (typeof val === 'boolean') return '<bool>';
		if (typeof val === 'bigint') return '<bigint>';
		if (val instanceof RegExp) return '<regexp>';
		if (val instanceof Date) return '<date>';
		if (Array.isArray(val)) {
			if (val.length === 0) return [];
			if (val.length === 1) return ['<1>'];
			if (val.length <= 5) return ['<2-5>'];
			return ['<6+>'];
		}
		return val;
	};

	try {
		return JSON.stringify(query, abstractTypes);
	} catch (error) {
		if (error instanceof TypeError && error.message.includes('BigInt')) {
			const bigintReplacer = (key: string, val: unknown): unknown => {
				if (typeof val === 'bigint') return '<bigint>';
				return abstractTypes(key, val);
			};
			return JSON.stringify(query, bigintReplacer);
		}
		throw error;
	}
}
