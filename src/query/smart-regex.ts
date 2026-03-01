import type { RxJsonSchema, RxDocumentData } from 'rxdb';
import { getIndexCache } from './cache';

export interface SqlFragment {
	sql: string;
	args: (string | number | boolean)[];
}

function hasExpressionIndex<RxDocType>(
	fieldName: string,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>
): boolean {
	const cache = getIndexCache();
	const cacheKey = `${fieldName}:${JSON.stringify(schema.indexes || [])}`;
	
	const cached = cache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}
	
	if (!schema.indexes) {
		cache.set(cacheKey, false);
		return false;
	}
	
	const hasLowerIndex = schema.indexes.some(idx => {
		const fields = Array.isArray(idx) ? idx : [idx];
		return fields.some(f => {
			if (typeof f !== 'string') return false;
			const normalized = f.toLowerCase().replace(/\s/g, '');
			return normalized === `lower(${fieldName})`;
		});
	});
	
	cache.set(cacheKey, hasLowerIndex);
	return hasLowerIndex;
}

function isValidRegexOptions(options: string): boolean {
	for (let i = 0; i < options.length; i++) {
		const c = options[i];
		if (c !== 'i' && c !== 'm' && c !== 's' && c !== 'x' && c !== 'u') return false;
	}
	return true;
}

function isComplexRegex(pattern: string): boolean {
	return /[*+?()[\]{}|]/.test(pattern.replace(/\\\./g, ''));
}

function escapeForLike(str: string): string {
	return str.replace(/[\\%_]/g, '\\$&');
}

export function smartRegexToLike<RxDocType>(
	field: string,
	pattern: string,
	options: string | undefined,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	fieldName: string
): SqlFragment | null {
	if (typeof pattern !== 'string') return null;
	
	if (options && !isValidRegexOptions(options)) {
		throw new Error(`Invalid regex options: "${options}". Valid options are: i, m, s, x, u`);
	}
	
	const caseInsensitive = options?.includes('i') ?? false;
	const hasLowerIndex = hasExpressionIndex(fieldName, schema);
	
	const startsWithAnchor = pattern.startsWith('^');
	const endsWithAnchor = pattern.endsWith('$');
	let cleanPattern = pattern.replace(/^\^/, '').replace(/\$$/, '');
	
	if (isComplexRegex(cleanPattern)) {
		return null;
	}
	
	const unescaped = cleanPattern.replace(/\\\./g, '.');
	const escaped = escapeForLike(unescaped);
	
	if (startsWithAnchor && endsWithAnchor) {
		if (caseInsensitive) {
			return { sql: `LOWER(${field}) = LOWER(?)`, args: [unescaped] };
		}
		return { sql: `${field} = ?`, args: [unescaped] };
	}
	
	if (startsWithAnchor) {
		if (caseInsensitive) {
			return { sql: `LOWER(${field}) LIKE LOWER(?) ESCAPE '\\'`, args: [escaped + '%'] };
		}
		return { sql: `${field} LIKE ? ESCAPE '\\'`, args: [escaped + '%'] };
	}
	
	if (endsWithAnchor) {
		if (caseInsensitive) {
			return { sql: `LOWER(${field}) LIKE LOWER(?) ESCAPE '\\'`, args: ['%' + escaped] };
		}
		return { sql: `${field} LIKE ? ESCAPE '\\'`, args: ['%' + escaped] };
	}
	
	if (caseInsensitive) {
		return { sql: `LOWER(${field}) LIKE LOWER(?) ESCAPE '\\'`, args: ['%' + escaped + '%'] };
	}
	return { sql: `${field} LIKE ? ESCAPE '\\'`, args: ['%' + escaped + '%'] };
}
