import type { RxJsonSchema, RxDocumentData } from 'rxdb';
import { getColumnInfo } from './schema-mapper';

export interface SqlFragment {
	sql: string;
	args: (string | number | boolean | null)[];
}

type QueryValue = string | number | boolean | null;
type OperatorExpression = { [key: string]: unknown };
export type ElemMatchCriteria = QueryValue | OperatorExpression;

import { smartRegexToLike } from './smart-regex';

export function translateEq<RxDocType>(
	field: string, 
	value: unknown,
	schema?: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName?: string
): SqlFragment {
	if (value === null) {
		return { sql: `${field} IS NULL`, args: [] };
	}
	
	if (schema && actualFieldName) {
		const columnInfo = getColumnInfo(actualFieldName, schema);
		if (field !== 'value' && columnInfo.type === 'array') {
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE value = ?)`,
				args: [value as string | number | boolean]
			};
		}
	}
	
	return { sql: `${field} = ?`, args: [value as string | number | boolean] };
}

export function translateNe<RxDocType>(
	field: string, 
	value: unknown,
	schema?: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName?: string
): SqlFragment {
	if (value === null) {
		return { sql: `${field} IS NOT NULL`, args: [] };
	}
	
	if (schema && actualFieldName) {
		const columnInfo = getColumnInfo(actualFieldName, schema);
		if (field !== 'value' && columnInfo.type === 'array') {
			return {
				sql: `NOT EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE value = ?)`,
				args: [value as string | number | boolean]
			};
		}
	}
	
	return { sql: `(${field} <> ? OR ${field} IS NULL)`, args: [value as string | number | boolean] };
}

export function translateGt<RxDocType>(
	field: string, 
	value: unknown,
	schema?: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName?: string
): SqlFragment {
	if (schema && actualFieldName) {
		const columnInfo = getColumnInfo(actualFieldName, schema);
		if (field !== 'value' && columnInfo.type === 'array') {
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE value > ?)`,
				args: [value as string | number]
			};
		}
	}
	return { sql: `${field} > ?`, args: [value as string | number] };
}

export function translateGte<RxDocType>(
	field: string, 
	value: unknown,
	schema?: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName?: string
): SqlFragment {
	if (schema && actualFieldName) {
		const columnInfo = getColumnInfo(actualFieldName, schema);
		if (field !== 'value' && columnInfo.type === 'array') {
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE value >= ?)`,
				args: [value as string | number]
			};
		}
	}
	return { sql: `${field} >= ?`, args: [value as string | number] };
}

export function translateLt<RxDocType>(
	field: string, 
	value: unknown,
	schema?: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName?: string
): SqlFragment {
	if (schema && actualFieldName) {
		const columnInfo = getColumnInfo(actualFieldName, schema);
		if (field !== 'value' && columnInfo.type === 'array') {
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE value < ?)`,
				args: [value as string | number]
			};
		}
	}
	
	return { sql: `${field} < ?`, args: [value as string | number] };
}

export function translateLte<RxDocType>(
	field: string, 
	value: unknown,
	schema?: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName?: string
): SqlFragment {
	if (schema && actualFieldName) {
		const columnInfo = getColumnInfo(actualFieldName, schema);
		if (field !== 'value' && columnInfo.type === 'array') {
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE value <= ?)`,
				args: [value as string | number]
			};
		}
	}
	return { sql: `${field} <= ?`, args: [value as string | number] };
}

export function translateIn<RxDocType>(
	field: string,
	values: unknown[],
	schema?: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName?: string
): SqlFragment {
	if (!Array.isArray(values) || values.length === 0) {
		return { sql: '1=0', args: [] };
	}

	const hasNull = values.includes(null);
	const nonNullValues = values.filter(v => v !== null) as (string | number | boolean)[];

	if (nonNullValues.length === 0) {
		return { sql: `${field} IS NULL`, args: [] };
	}

	if (schema && actualFieldName) {
		const columnInfo = getColumnInfo(actualFieldName, schema);
		if (field !== 'value' && columnInfo.type === 'array') {
			const inClause = `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE value IN (SELECT value FROM json_each(?)))`;
			const args = [JSON.stringify(nonNullValues)];

			if (hasNull) {
				return {
					sql: `(${inClause} OR ${field} IS NULL)`,
					args
				};
			}

			return { sql: inClause, args };
		}
	}

	const inClause = `${field} IN (SELECT value FROM json_each(?))`;
	const args = [JSON.stringify(nonNullValues)];

	if (hasNull) {
		return {
			sql: `(${inClause} OR ${field} IS NULL)`,
			args
		};
	}

	return { sql: inClause, args };
}

export function translateNin<RxDocType>(
	field: string,
	values: unknown[],
	schema?: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName?: string
): SqlFragment {
	if (!Array.isArray(values) || values.length === 0) {
		return { sql: '1=1', args: [] };
	}

	const hasNull = values.includes(null);
	const nonNullValues = values.filter(v => v !== null) as (string | number | boolean)[];

	if (nonNullValues.length === 0) {
		return { sql: `${field} IS NOT NULL`, args: [] };
	}

	if (schema && actualFieldName) {
		const columnInfo = getColumnInfo(actualFieldName, schema);
		if (field !== 'value' && columnInfo.type === 'array') {
			const ninClause = `NOT EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE value IN (SELECT value FROM json_each(?)))`;
			const args = [JSON.stringify(nonNullValues)];

			if (hasNull) {
				return {
					sql: `(${ninClause} AND ${field} IS NOT NULL)`,
					args
				};
			}

			return { sql: ninClause, args };
		}
	}

	const ninClause = `${field} NOT IN (SELECT value FROM json_each(?))`;
	const args = [JSON.stringify(nonNullValues)];

	if (hasNull) {
		return {
			sql: `(${ninClause} AND ${field} IS NOT NULL)`,
			args
		};
	}

	return { sql: ninClause, args };
}

export function translateExists(field: string, exists: boolean): SqlFragment {
	return {
		sql: exists ? `${field} IS NOT NULL` : `${field} IS NULL`,
		args: []
	};
}

export function translateRegex<RxDocType>(
	field: string,
	pattern: string,
	options: string | undefined,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	fieldName: string
): SqlFragment | null {
	const smartResult = smartRegexToLike(field, pattern, options, schema, fieldName);
	if (smartResult) return smartResult;

	return null;
}

function buildElemMatchConditions<RxDocType>(
	criteria: Record<string, unknown>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	baseFieldName: string
): SqlFragment {
	const conditions: string[] = [];
	const args: (string | number | boolean | null)[] = [];

	for (const [key, value] of Object.entries(criteria)) {
		if (key.startsWith('$')) {
			const fragment = processOperatorValue('value', { [key]: value }, schema, baseFieldName);
			conditions.push(fragment.sql);
			args.push(...fragment.args);
		} else {
			const propertyField = `json_extract(value, '$.${key}')`;
			const nestedFieldName = `${baseFieldName}.${key}`;
			const fragment = processOperatorValue(propertyField, value, schema, nestedFieldName);
			conditions.push(fragment.sql);
			args.push(...fragment.args);
		}
	}

	return {
		sql: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
		args
	};
}

export function translateElemMatch<RxDocType>(
	field: string, 
	criteria: ElemMatchCriteria,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName: string
): SqlFragment | null {
	// Empty criteria is data corruption - fail fast
	if (typeof criteria === 'object' && criteria !== null && !Array.isArray(criteria) && Object.keys(criteria).length === 0) {
		return { sql: '1=0', args: [] };
	}
	
	if (typeof criteria !== 'object' || criteria === null) {
		return {
			sql: `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE value = ?)`,
			args: [criteria]
		};
	}

	if (criteria.$and && Array.isArray(criteria.$and)) {
		const fragments = criteria.$and.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond, schema, actualFieldName));
		const sql = fragments.map(f => f.sql).join(' AND ');
		const args = fragments.flatMap(f => f.args);
		return {
			sql: `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE ${sql})`,
			args
		};
	}

	if (criteria.$or && Array.isArray(criteria.$or)) {
		const fragments = criteria.$or.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond, schema, actualFieldName));
		const sql = fragments.map(f => f.sql).join(' OR ');
		const args = fragments.flatMap(f => f.args);
		return {
			sql: `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE ${sql})`,
			args
		};
	}

	if (criteria.$nor && Array.isArray(criteria.$nor)) {
		const fragments = criteria.$nor.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond, schema, actualFieldName));
		const sql = fragments.map(f => f.sql).join(' OR ');
		const args = fragments.flatMap(f => f.args);
		return {
			sql: `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE NOT (${sql}))`,
			args
		};
	}

	const fragment = buildElemMatchConditions(criteria as Record<string, unknown>, schema, actualFieldName);
	return {
		sql: `EXISTS (SELECT 1 FROM jsonb_each(${field}) WHERE ${fragment.sql})`,
		args: fragment.args
	};
}

function processOperatorValue<RxDocType>(
	field: string, 
	value: unknown,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName: string
): SqlFragment {
	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const [[op, opValue]] = Object.entries(value);

		if (!op.startsWith('$')) {
			const jsonPath = `json_extract(${field}, '$.${op}')`;
			const nestedFieldName = `${actualFieldName}.${op}`;
			return translateEq(jsonPath, opValue, schema, nestedFieldName);
		}

		switch (op) {
		case '$eq': return translateEq(field, opValue, schema, actualFieldName);
		case '$ne': return translateNe(field, opValue, schema, actualFieldName);
		case '$gt': return translateGt(field, opValue, schema, actualFieldName);
		case '$gte': return translateGte(field, opValue, schema, actualFieldName);
			case '$lt': return translateLt(field, opValue, schema, actualFieldName);
			case '$lte': return translateLte(field, opValue, schema, actualFieldName);
			case '$in': return translateIn(field, opValue as unknown[], schema, actualFieldName);
			case '$nin': return translateNin(field, opValue as unknown[], schema, actualFieldName);
			case '$exists': return translateExists(field, opValue as boolean);
			case '$size': return translateSize(field, opValue as number);
		case '$mod': {
			const result = translateMod(field, opValue);
			if (!result) return translateEq(field, opValue, schema, actualFieldName);
			return result;
		}
		case '$regex': {
			const options = (value as Record<string, unknown>).$options as string | undefined;
			const regexFragment = translateRegex(field, opValue as string, options, schema, actualFieldName);
			return regexFragment || { sql: '1=0', args: [] };
		}
		case '$type': {
			let jsonCol = 'data';
			let path = `$.${actualFieldName}`;
			let useDirectType = false;
			
		if (field === 'value') {
			jsonCol = 'value';
			path = '';
			useDirectType = true;
		} else if (field.startsWith('json_extract(')) {
			const match = field.match(/json_extract\(([^,]+),\s*'([^']+)'\)/);
			if (match) {
				jsonCol = match[1];
				path = match[2];
			}
		}
		
		if (useDirectType) {
			const typeMap: Record<string, string> = {
				'null': 'null',
				'boolean': 'true',
				'number': 'integer',
				'string': 'text',
				'array': 'array',
				'object': 'object'
			};
			const sqlType = typeMap[opValue as string];
			if (!sqlType) return { sql: '1=0', args: [] };
			
			if (opValue === 'boolean') {
				return { sql: `(type IN ('true', 'false'))`, args: [] };
			}
			if (opValue === 'number') {
				return { sql: `(type IN ('integer', 'real'))`, args: [] };
			}
			
			return { sql: `type = '${sqlType}'`, args: [] };
		}
		
		const typeFragment = translateType(jsonCol, path, opValue as string, true);
		return typeFragment || { sql: '1=0', args: [] };
	}
		case '$elemMatch': {
			const elemMatchFragment = translateElemMatch(field, opValue as ElemMatchCriteria, schema, actualFieldName);
			return elemMatchFragment || { sql: '1=0', args: [] };
		}
		case '$not': {
			const result = translateNot(field, opValue, schema, actualFieldName);
			if (!result) return translateEq(field, opValue, schema, actualFieldName);
			return result;
		}
		case '$and': {
			if (!Array.isArray(opValue)) return translateEq(field, opValue, schema, actualFieldName);
			const fragments = opValue.map(v => processOperatorValue(field, v, schema, actualFieldName));
			const sql = fragments.map(f => f.sql).join(' AND ');
			const args = fragments.flatMap(f => f.args);
			return { sql: `(${sql})`, args };
		}
		case '$or': {
			if (!Array.isArray(opValue)) return translateEq(field, opValue, schema, actualFieldName);
			const fragments = opValue.map(v => processOperatorValue(field, v, schema, actualFieldName));
			const sql = fragments.map(f => f.sql).join(' OR ');
			const args = fragments.flatMap(f => f.args);
			return { sql: `(${sql})`, args };
		}
			default: return translateEq(field, opValue, schema, actualFieldName);
		}
	}

	return translateEq(field, value, schema, actualFieldName);
}

export function translateNot<RxDocType>(
	field: string, 
	criteria: unknown,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName: string
): SqlFragment | null {
	// MongoDB requires $not to have an operator expression, not a primitive value
	// Reject: undefined, null, primitives (false, 0, "", true, numbers, strings), empty objects
	if (criteria === undefined || 
	    criteria === null || 
	    typeof criteria !== 'object' || 
	    Array.isArray(criteria) ||
	    Object.keys(criteria).length === 0) {
		return { sql: '1=0', args: [] };
	}
	
	const inner = processOperatorValue(field, criteria, schema, actualFieldName);
	return {
		sql: `NOT (${inner.sql})`,
		args: inner.args
	};
}

export function translateType(
	jsonColumn: string,
	fieldName: string,
	type: string,
	isDirectPath: boolean = false
): SqlFragment | null {
	const jsonPath = isDirectPath ? fieldName : `$.${fieldName}`;

	switch (type) {
		case 'null': return { sql: `json_type(${jsonColumn}, '${jsonPath}') = 'null'`, args: [] };
		case 'boolean': return { sql: `json_type(${jsonColumn}, '${jsonPath}') IN ('true', 'false')`, args: [] };
		case 'number': return { sql: `json_type(${jsonColumn}, '${jsonPath}') IN ('integer', 'real')`, args: [] };
		case 'string': return { sql: `json_type(${jsonColumn}, '${jsonPath}') = 'text'`, args: [] };
		case 'array': return { sql: `json_type(${jsonColumn}, '${jsonPath}') = 'array'`, args: [] };
		case 'object': return { sql: `json_type(${jsonColumn}, '${jsonPath}') = 'object'`, args: [] };
		default: return { sql: '1=0', args: [] };
	}
}

export function translateSize(field: string, size: number): SqlFragment {
	return {
		sql: `json_array_length(${field}) = ?`,
		args: [size]
	};
}

export function translateMod(field: string, value: unknown): SqlFragment | null {
	if (!Array.isArray(value) || value.length !== 2) return { sql: '1=0', args: [] };
	const [divisor, remainder] = value;
	// SQLite's % operator casts to INTEGER, but MongoDB's $mod preserves decimals
	// Use: value - (CAST(value / divisor AS INTEGER) * divisor) = remainder
	return {
		sql: `(${field} - (CAST(${field} / ? AS INTEGER) * ?)) = ?`,
		args: [divisor, divisor, remainder]
	};
}
