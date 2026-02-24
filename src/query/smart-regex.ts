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

export function smartRegexToLike<RxDocType>(
	field: string,
	pattern: string,
	options: string | undefined,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	fieldName: string
): SqlFragment | null {
	const caseInsensitive = options?.includes('i');
	const startsWithAnchor = pattern.startsWith('^');
	const endsWithAnchor = pattern.endsWith('$');
	
	let cleanPattern = pattern.replace(/^\^/, '').replace(/\$$/, '');
	
	if (startsWithAnchor && endsWithAnchor && !/[*+?()[\]{}|]/.test(cleanPattern)) {
		const exact = cleanPattern.replace(/\\\./g, '.');
		if (caseInsensitive) {
			const lowerExact = exact.toLowerCase();
			if (hasExpressionIndex(fieldName, schema)) {
				return { sql: `LOWER(${field}) = ?`, args: [lowerExact] };
			}
			return { sql: `${field} = ? COLLATE NOCASE`, args: [exact] };
		}
		return { sql: `${field} = ?`, args: [exact] };
	}
	
	if (startsWithAnchor) {
		const prefix = cleanPattern.replace(/\\\./g, '.');
		if (!/[*+?()[\]{}|]/.test(prefix)) {
			const escaped = prefix.replace(/%/g, '\\%').replace(/_/g, '\\_');
			if (caseInsensitive) {
				const lowerEscaped = escaped.toLowerCase();
				if (hasExpressionIndex(fieldName, schema)) {
					return { sql: `LOWER(${field}) LIKE ? ESCAPE '\\'`, args: [lowerEscaped + '%'] };
				}
				return { sql: `${field} LIKE ? COLLATE NOCASE ESCAPE '\\'`, args: [escaped + '%'] };
			}
			return { sql: `${field} LIKE ? ESCAPE '\\'`, args: [escaped + '%'] };
		}
	}
	
	if (endsWithAnchor) {
		const suffix = cleanPattern.replace(/\\\./g, '.');
		if (!/[*+?()[\]{}|]/.test(suffix)) {
			const escaped = suffix.replace(/%/g, '\\%').replace(/_/g, '\\_');
			if (caseInsensitive) {
				const lowerEscaped = escaped.toLowerCase();
				if (hasExpressionIndex(fieldName, schema)) {
					return { sql: `LOWER(${field}) LIKE ? ESCAPE '\\'`, args: ['%' + lowerEscaped] };
				}
				return { sql: `${field} LIKE ? COLLATE NOCASE ESCAPE '\\'`, args: ['%' + escaped] };
			}
			return { sql: `${field} LIKE ? ESCAPE '\\'`, args: ['%' + escaped] };
		}
	}
	
	cleanPattern = cleanPattern.replace(/\\\./g, '.');
	if (!/[*+?()[\]{}|^$]/.test(cleanPattern)) {
		const escaped = cleanPattern.replace(/%/g, '\\%').replace(/_/g, '\\_');
		if (caseInsensitive) {
			const lowerEscaped = escaped.toLowerCase();
			if (hasExpressionIndex(fieldName, schema)) {
				return { sql: `LOWER(${field}) LIKE ? ESCAPE '\\'`, args: ['%' + lowerEscaped + '%'] };
			}
			return { sql: `${field} LIKE ? COLLATE NOCASE ESCAPE '\\'`, args: ['%' + escaped + '%'] };
		}
		return { sql: `${field} LIKE ? ESCAPE '\\'`, args: ['%' + escaped + '%'] };
	}
	
	return null;
}
