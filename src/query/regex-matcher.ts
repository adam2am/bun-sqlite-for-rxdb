import { getRegexCache } from './cache';

function isValidRegexOptions(options: string): boolean {
	for (let i = 0; i < options.length; i++) {
		const c = options[i];
		if (c !== 'i' && c !== 'm' && c !== 's' && c !== 'x' && c !== 'u') return false;
	}
	return true;
}

function compileRegex(pattern: string, options?: string): RegExp {
	const cache = getRegexCache();
	const cacheKey = `${pattern}:${options || ''}`;
	const cached = cache.get(cacheKey);
	if (cached) {
		return cached.regex;
	}

	if (options && !isValidRegexOptions(options)) {
		throw new Error(`Invalid regex options: ${options}`);
	}

	const regex = new RegExp(pattern, options);
	cache.set(cacheKey, { regex });
	return regex;
}

export function matchesRegex(value: unknown, pattern: string, options?: string): boolean {
	if (typeof pattern !== 'string' || pattern === '') {
		console.error('[matchesRegex] Invalid pattern:', { pattern, type: typeof pattern, options });
		return false;
	}

	let regex: RegExp;
	try {
		regex = compileRegex(pattern, options);
	} catch (e) {
		console.error('[matchesRegex] Regex compilation failed:', { pattern, options, error: e });
		return false;
	}

	if (typeof value === 'string') {
		return regex.test(value);
	}

	if (Array.isArray(value)) {
		return value.some(v => typeof v === 'string' && regex.test(v));
	}

	return false;
}


