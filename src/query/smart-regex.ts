import type { RxJsonSchema, RxDocumentData } from 'rxdb';

export interface SqlFragment {
	sql: string;
	args: (string | number | boolean)[];
}

const INDEX_CACHE = new Map<string, boolean>();
const MAX_INDEX_CACHE_SIZE = 1000;

function hasExpressionIndex<RxDocType>(
	fieldName: string,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>
): boolean {
	const indexKey = schema.indexes ? JSON.stringify(schema.indexes) : 'none';
	const cacheKey = `${schema.version}_${fieldName}_${indexKey}`;
	
	const cached = INDEX_CACHE.get(cacheKey);
	if (cached !== undefined) {
		INDEX_CACHE.delete(cacheKey);
		INDEX_CACHE.set(cacheKey, cached);
		return cached;
	}
	
	if (!schema.indexes) {
		if (INDEX_CACHE.size >= MAX_INDEX_CACHE_SIZE) {
			const firstKey = INDEX_CACHE.keys().next().value;
			if (firstKey) INDEX_CACHE.delete(firstKey);
		}
		INDEX_CACHE.set(cacheKey, false);
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
	
	if (INDEX_CACHE.size >= MAX_INDEX_CACHE_SIZE) {
		const firstKey = INDEX_CACHE.keys().next().value;
		if (firstKey) INDEX_CACHE.delete(firstKey);
	}
	
	INDEX_CACHE.set(cacheKey, hasLowerIndex);
	return hasLowerIndex;
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
			return hasLowerIndex
				? { sql: `LOWER(${field}) = ?`, args: [unescaped.toLowerCase()] }
				: { sql: `${field} = ? COLLATE NOCASE`, args: [unescaped] };
		}
		return { sql: `${field} = ?`, args: [unescaped] };
	}
	
	if (startsWithAnchor) {
		const suffix = caseInsensitive ? escaped.toLowerCase() : escaped;
		if (caseInsensitive && hasLowerIndex) {
			return { sql: `LOWER(${field}) LIKE ? ESCAPE '\\'`, args: [suffix + '%'] };
		}
		return { sql: `${field} LIKE ?${caseInsensitive ? ' COLLATE NOCASE' : ''} ESCAPE '\\'`, args: [suffix + '%'] };
	}
	
	if (endsWithAnchor) {
		const prefix = caseInsensitive ? escaped.toLowerCase() : escaped;
		if (caseInsensitive && hasLowerIndex) {
			return { sql: `LOWER(${field}) LIKE ? ESCAPE '\\'`, args: ['%' + prefix] };
		}
		return { sql: `${field} LIKE ?${caseInsensitive ? ' COLLATE NOCASE' : ''} ESCAPE '\\'`, args: ['%' + prefix] };
	}
	
	const middle = caseInsensitive ? escaped.toLowerCase() : escaped;
	if (caseInsensitive && hasLowerIndex) {
		return { sql: `LOWER(${field}) LIKE ? ESCAPE '\\'`, args: ['%' + middle + '%'] };
	}
	return { sql: `${field} LIKE ?${caseInsensitive ? ' COLLATE NOCASE' : ''} ESCAPE '\\'`, args: ['%' + middle + '%'] };
}
