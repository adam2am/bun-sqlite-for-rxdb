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

export function translateNot(field: string, criteria: any): SqlFragment {
	const inner = processOperatorValue(field, criteria);
	return {
		sql: `NOT(${inner.sql})`,
		args: inner.args
	};
}

export function translateNor(conditions: any[]): SqlFragment {
	if (conditions.length === 0) {
		return { sql: '1=1', args: [] };
	}
	
	const fragments = conditions.map(condition => {
		const [[field, value]] = Object.entries(condition);
		return processOperatorValue(field, value);
	});
	
	const sql = fragments.map(f => `(${f.sql})`).join(' OR ');
	const args = fragments.flatMap(f => f.args);
	
	return {
		sql: `NOT(${sql})`,
		args
	};
}

function processOperatorValue(field: string, value: any): SqlFragment {
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const [[op, opValue]] = Object.entries(value);
		
		switch (op) {
			case '$eq': return translateEq(field, opValue);
			case '$ne': return translateNe(field, opValue);
			case '$gt': return translateGt(field, opValue);
			case '$gte': return translateGte(field, opValue);
			case '$lt': return translateLt(field, opValue);
			case '$lte': return translateLte(field, opValue);
			case '$in': return translateIn(field, opValue as unknown[]);
			case '$nin': return translateNin(field, opValue as unknown[]);
			default: return translateEq(field, opValue);
		}
	}
	
	return translateEq(field, value);
}

export function translateType(field: string, type: string): SqlFragment | null {
	switch (type) {
		case 'number':
			return { 
				sql: `(typeof(${field}) = 'integer' OR typeof(${field}) = 'real')`, 
				args: [] 
			};
		case 'string':
			return { sql: `typeof(${field}) = 'text'`, args: [] };
		case 'null':
			return { sql: `typeof(${field}) = 'null'`, args: [] };
		case 'boolean':
		case 'array':
		case 'object':
		case 'date':
		default:
			return null;
	}
}

export function translateSize(field: string, size: number): SqlFragment {
	return {
		sql: `json_array_length(${field}) = ?`,
		args: [size]
	};
}

export function translateMod(field: string, [divisor, remainder]: [number, number]): SqlFragment {
	return {
		sql: `${field} % ? = ?`,
		args: [divisor, remainder]
	};
}
