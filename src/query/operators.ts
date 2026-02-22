export interface SqlFragment {
	sql: string;
	args: (string | number | boolean | null)[];
}

export function translateEq(field: string, value: unknown): SqlFragment {
	if (value === null) {
		return { sql: `${field} IS NULL`, args: [] };
	}
	return { sql: `${field} = ?`, args: [value as string | number | boolean] };
}

export function translateNe(field: string, value: unknown): SqlFragment {
	if (value === null) {
		return { sql: `${field} IS NOT NULL`, args: [] };
	}
	return { sql: `${field} <> ?`, args: [value as string | number | boolean] };
}

export function translateGt(field: string, value: unknown): SqlFragment {
	return { sql: `${field} > ?`, args: [value as string | number] };
}

export function translateGte(field: string, value: unknown): SqlFragment {
	return { sql: `${field} >= ?`, args: [value as string | number] };
}

export function translateLt(field: string, value: unknown): SqlFragment {
	return { sql: `${field} < ?`, args: [value as string | number] };
}

export function translateLte(field: string, value: unknown): SqlFragment {
	return { sql: `${field} <= ?`, args: [value as string | number] };
}

export function translateIn(field: string, values: unknown[]): SqlFragment {
	if (!Array.isArray(values) || values.length === 0) {
		return { sql: '1=0', args: [] };
	}

	const hasNull = values.includes(null);
	const nonNullValues = values.filter(v => v !== null) as (string | number | boolean)[];

	if (nonNullValues.length === 0) {
		return { sql: `${field} IS NULL`, args: [] };
	}

	const placeholders = nonNullValues.map(() => '?').join(', ');
	const inClause = `${field} IN (${placeholders})`;

	if (hasNull) {
		return { 
			sql: `(${inClause} OR ${field} IS NULL)`, 
			args: nonNullValues 
		};
	}

	return { sql: inClause, args: nonNullValues };
}

export function translateNin(field: string, values: unknown[]): SqlFragment {
	if (!Array.isArray(values) || values.length === 0) {
		return { sql: '1=1', args: [] };
	}

	const hasNull = values.includes(null);
	const nonNullValues = values.filter(v => v !== null) as (string | number | boolean)[];

	if (nonNullValues.length === 0) {
		return { sql: `${field} IS NOT NULL`, args: [] };
	}

	const placeholders = nonNullValues.map(() => '?').join(', ');
	const ninClause = `${field} NOT IN (${placeholders})`;

	if (hasNull) {
		return { 
			sql: `(${ninClause} AND ${field} IS NOT NULL)`, 
			args: nonNullValues 
		};
	}

	return { sql: ninClause, args: nonNullValues };
}

export function translateExists(field: string, exists: boolean): SqlFragment {
	return {
		sql: exists ? `${field} IS NOT NULL` : `${field} IS NULL`,
		args: []
	};
}

export function translateRegex(field: string, pattern: string, options?: string): SqlFragment | null {
	const caseInsensitive = options?.includes('i');
	
	const startsWithAnchor = pattern.startsWith('^');
	const endsWithAnchor = pattern.endsWith('$');
	
	let cleanPattern = pattern.replace(/^\^/, '').replace(/\$$/, '');
	
	const isSimple = /^[\w\s\-@.\\]+$/.test(cleanPattern);
	if (!isSimple) return null;
	
	cleanPattern = cleanPattern.replace(/\\\./g, '.');
	cleanPattern = cleanPattern.replace(/%/g, '\\%').replace(/_/g, '\\_');
	
	let likePattern = cleanPattern;
	if (!startsWithAnchor) likePattern = '%' + likePattern;
	if (!endsWithAnchor) likePattern = likePattern + '%';
	
	const collation = caseInsensitive ? ' COLLATE NOCASE' : '';
	
	return { 
		sql: `${field} LIKE ?${collation} ESCAPE '\\'`, 
		args: [likePattern] 
	};
}

export function translateElemMatch(field: string, criteria: any): SqlFragment | null {
	return null;
}
