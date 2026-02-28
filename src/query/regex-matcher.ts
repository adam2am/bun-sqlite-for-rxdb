interface RegexCacheEntry {
	regex: RegExp;
}

const REGEX_CACHE = new Map<string, RegexCacheEntry>();
const MAX_REGEX_CACHE_SIZE = 100;

function compileRegex(pattern: string, options?: string): RegExp {
	const cacheKey = `${pattern}::${options || ''}`;

	const cached = REGEX_CACHE.get(cacheKey);
	if (cached) {
		return cached.regex;
	}

	const regex = new RegExp(pattern, options);

	if (REGEX_CACHE.size >= MAX_REGEX_CACHE_SIZE) {
		const firstKey = REGEX_CACHE.keys().next().value;
		if (firstKey) {
			REGEX_CACHE.delete(firstKey);
		}
	}

	REGEX_CACHE.set(cacheKey, { regex });
	return regex;
}

export function matchesRegex(value: unknown, pattern: string, options?: string): boolean {
	const regex = compileRegex(pattern, options);

	if (typeof value === 'string') {
		return regex.test(value);
	}

	if (Array.isArray(value)) {
		return value.some(v => typeof v === 'string' && regex.test(v));
	}

	return false;
}
