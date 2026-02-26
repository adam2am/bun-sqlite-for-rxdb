/**
 * Bun-optimized deterministic JSON stringification.
 * Phase 1: Basic implementation with core optimizations.
 * 
 * Performance target: >21,000 ops/sec (baseline)
 * Optimizations:
 * - Manual loops (no .map() overhead)
 * - Custom insertion sort for small arrays (<200 elements)
 * - String escape fast path
 * - Direct string concatenation
 */

// Fast path for simple strings (< 5000 chars, no escape sequences)
const strEscapeRegex = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;

function strEscape(str: string): string {
	if (str.length < 5000 && !strEscapeRegex.test(str)) {
		return `"${str}"`;
	}
	return JSON.stringify(str);
}

// Custom insertion sort for small arrays (better cache locality)
function sortKeys(keys: string[]): string[] {
	if (keys.length > 200) {
		return keys.sort(); // Native sort for large arrays
	}
	
	// Insertion sort for small arrays
	for (let i = 1; i < keys.length; i++) {
		const current = keys[i];
		let pos = i;
		while (pos !== 0 && keys[pos - 1] > current) {
			keys[pos] = keys[pos - 1];
			pos--;
		}
		keys[pos] = current;
	}
	return keys;
}

export function stableStringify(value: unknown): string {
	// Primitives
	if (value === null) return 'null';
	if (value === true) return 'true';
	if (value === false) return 'false';
	
	const type = typeof value;
	if (type === 'string') return strEscape(value as string);
	if (type === 'number') return isFinite(value as number) ? String(value) : 'null';
	if (type === 'undefined') return 'null';
	
	if (Array.isArray(value)) {
		let res = '[';
		for (let i = 0; i < value.length; i++) {
			if (i > 0) res += ',';
			res += stableStringify(value[i]);
		}
		return res + ']';
	}
	
	if (type === 'object') {
		const obj = value as Record<string, unknown>;
		
		if ('toJSON' in obj && typeof obj.toJSON === 'function') {
			return stableStringify(obj.toJSON());
		}
		
		const keys = sortKeys(Object.keys(obj));
		let res = '{';
		for (let i = 0; i < keys.length; i++) {
			if (i > 0) res += ',';
			const key = keys[i];
			res += strEscape(key) + ':' + stableStringify(obj[key]);
		}
		return res + '}';
	}
	
	return 'null';
}
