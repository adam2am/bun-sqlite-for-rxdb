/**
 * Bun-optimized deterministic JSON stringification.
 * Phase 1: Basic implementation with core optimizations + edge case handling.
 * 
 * Performance target: >21,000 ops/sec (baseline)
 * Optimizations:
 * - Manual loops (no .map() overhead)
 * - Custom insertion sort for small arrays (<200 elements)
 * - String escape fast path
 * - Direct string concatenation
 * - Circular reference detection
 * - BigInt support
 * - Non-plain object handling (Date, RegExp, Error)
 */

const strEscapeRegex = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;

function strEscape(str: string): string {
	if (str.length < 5000 && !strEscapeRegex.test(str)) {
		return `"${str}"`;
	}
	return JSON.stringify(str);
}

function sortKeys(keys: string[]): string[] {
	if (keys.length > 100) {
		return keys.sort();
	}
	
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
	return _stringify(value, []);
}

function _stringify(value: unknown, stack: unknown[]): string {
	if (value === null) return 'null';
	if (value === true) return 'true';
	if (value === false) return 'false';
	
	const type = typeof value;
	if (type === 'string') return strEscape(value as string);
	if (type === 'number') return isFinite(value as number) ? String(value) : 'null';
	if (type === 'undefined') return 'null';
	if (type === 'bigint') return String(value);
	
	if (Array.isArray(value)) {
		if (stack.indexOf(value) !== -1) return '"[Circular]"';
		stack.push(value);
		
		if (value.length === 0) {
			stack.pop();
			return '[]';
		}
		
		let res = '[' + _stringify(value[0], stack);
		for (let i = 1; i < value.length; i++) {
			res += ',' + _stringify(value[i], stack);
		}
		
		stack.pop();
		return res + ']';
	}
	
	if (type === 'object') {
		const obj = value as Record<string, unknown>;
		
		if (stack.indexOf(value) !== -1) return '"[Circular]"';
		stack.push(value);
		
		if ('toJSON' in obj && typeof obj.toJSON === 'function') {
			const result = _stringify(obj.toJSON(), stack);
			stack.pop();
			return result;
		}
		
		const objType = Object.prototype.toString.call(obj);
		if (objType !== '[object Object]') {
			const result = JSON.stringify(obj);
			stack.pop();
			return result;
		}
		
		const keys = sortKeys(Object.keys(obj));
		let res = '{';
		let separator = '';
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const val = obj[key];
			if (val === undefined) continue;
			
			res += separator + strEscape(key) + ':' + _stringify(val, stack);
			separator = ',';
		}
		
		stack.pop();
		return res + '}';
	}
	
	return 'null';
}
