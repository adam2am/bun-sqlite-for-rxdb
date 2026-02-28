interface RegexCacheEntry {
	regex: RegExp;
}

const REGEX_CACHE = new Map<string, RegexCacheEntry>();
const MAX_REGEX_CACHE_SIZE = 100;

function isValidRegexOptions(options: string): boolean {
	for (let i = 0; i < options.length; i++) {
		const c = options[i];
		if (c !== 'i' && c !== 'm' && c !== 's' && c !== 'x' && c !== 'u') return false;
	}
	return true;
}

function compileRegex(pattern: string, options?: string): RegExp {
	const cacheKey = `${pattern}::${options || ''}`;

	const cached = REGEX_CACHE.get(cacheKey);
	if (cached) {
		return cached.regex;
	}

	if (options && !isValidRegexOptions(options)) {
		throw new Error(`Invalid regex options: "${options}". Valid options are: i, m, s, x, u`);
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
