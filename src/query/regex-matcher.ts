interface RegexCacheEntry {
	regex: RegExp;
	lastUsed: number;
}

const REGEX_CACHE = new Map<string, RegexCacheEntry>();
const MAX_REGEX_CACHE_SIZE = 100;

function compileRegex(pattern: string, options?: string): RegExp {
	const cacheKey = `${pattern}::${options || ''}`;

	const cached = REGEX_CACHE.get(cacheKey);
	if (cached) {
		cached.lastUsed = Date.now();
		return cached.regex;
	}

	const regex = new RegExp(pattern, options);

	if (REGEX_CACHE.size >= MAX_REGEX_CACHE_SIZE) {
		let oldestKey: string | null = null;
		let oldestTime = Infinity;

		for (const [key, entry] of REGEX_CACHE.entries()) {
			if (entry.lastUsed < oldestTime) {
				oldestTime = entry.lastUsed;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			REGEX_CACHE.delete(oldestKey);
		}
	}

	REGEX_CACHE.set(cacheKey, { regex, lastUsed: Date.now() });
	return regex;
}

export function matchesRegex(value: unknown, pattern: string, options?: string): boolean {
	// console.log(`[ourMemory] pattern="${pattern}", options=${options ? `"${options}"` : 'undefined'}`);
	const regex = compileRegex(pattern, options);

	if (typeof value === 'string') {
		return regex.test(value);
	}

	if (Array.isArray(value)) {
		return value.some(v => typeof v === 'string' && regex.test(v));
	}

	return false;
}
