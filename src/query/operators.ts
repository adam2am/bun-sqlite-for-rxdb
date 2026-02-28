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

/**
 * Normalizes values for SQLite binding compatibility.
 * SQLite only accepts: string | number | boolean | null | bigint | TypedArray
 * 
 * @param value - Value to normalize
 * @returns SQLite-compatible value
 */
function normalizeValueForSQLite(value: unknown): string | number | boolean | null {
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (value instanceof RegExp) {
		return JSON.stringify({ source: value.source, flags: value.flags });
	}
	if (value === undefined) {
		return null;
	}
	return value as string | number | boolean | null;
}

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
				args: [normalizeValueForSQLite(value)]
			};
		}
	}

	return { sql: `${field} = ?`, args: [normalizeValueForSQLite(value)] };
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
				args: [normalizeValueForSQLite(value)]
			};
		}
	}

	return { sql: `(${field} <> ? OR ${field} IS NULL)`, args: [normalizeValueForSQLite(value)] };
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
				args: [normalizeValueForSQLite(value)]
			};
		}
	}
	return { sql: `${field} > ?`, args: [normalizeValueForSQLite(value)] };
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
				args: [normalizeValueForSQLite(value)]
			};
		}
	}
	return { sql: `${field} >= ?`, args: [normalizeValueForSQLite(value)] };
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
				args: [normalizeValueForSQLite(value)]
			};
		}
	}

	return { sql: `${field} < ?`, args: [normalizeValueForSQLite(value)] };
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
				args: [normalizeValueForSQLite(value)]
			};
		}
	}
	return { sql: `${field} <= ?`, args: [normalizeValueForSQLite(value)] };
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
	const nonNullValues = values.filter(v => v !== null).map(v => normalizeValueForSQLite(v));

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
	const nonNullValues = values.filter(v => v !== null).map(v => normalizeValueForSQLite(v));

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

			return { sql: `(${field} IS NULL OR ${ninClause})`, args };
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

	return { sql: `(${field} IS NULL OR ${ninClause})`, args };
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

// Operator classification for O(1) lookups
const LOGICAL_OPERATORS = new Set(['$and', '$or', '$nor', '$not']);
const LEAF_OPERATORS = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists', '$regex', '$type', '$size', '$mod', '$elemMatch']);

function isLogicalOperator(key: string): boolean {
	return LOGICAL_OPERATORS.has(key);
}

function isOperatorObject(obj: Record<string, unknown>): boolean {
	return Object.keys(obj).every(k => k.startsWith('$'));
}

// EXTENDED MONGODB SYNTAX SUPPORT
// RxDB passes queries AS-IS to storage (normalizeMangoQuery only handles top-level keys)
// We support field-level $not with nested logical operators even though MongoDB/Mingo don't
// Rationale: Better UX, semantically correct transformation, consistent with TOLERANT READER pattern
function handleLogicalOperator<RxDocType>(
	operator: string,
	value: unknown,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	baseFieldName: string
): SqlFragment {
	if (operator === '$not') {
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			const innerFragment = buildElemMatchConditions(value as Record<string, unknown>, schema, baseFieldName);
			return { sql: `NOT (${innerFragment.sql})`, args: innerFragment.args };
		}
		return { sql: '1=1', args: [] };
	}

	if (!Array.isArray(value)) return { sql: '1=0', args: [] };
	
	const nestedConditions = value.map(cond =>
		buildElemMatchConditions(cond as Record<string, unknown>, schema, baseFieldName)
	);
	
	const joiner = operator === '$and' ? ' AND ' : (operator === '$or' ? ' OR ' : ' AND NOT ');
	const sql = nestedConditions.map(f => `(${f.sql})`).join(joiner);
	
	return {
		sql: `(${sql})`,
		args: nestedConditions.flatMap(f => f.args)
	};
}

function handleFieldCondition<RxDocType>(
	fieldName: string,
	value: unknown,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	baseFieldName: string
): SqlFragment {
	const propertyField = `json_extract(value, '$.${fieldName}')`;
	const nestedFieldName = `${baseFieldName}.${fieldName}`;

	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		const valueObj = value as Record<string, unknown>;
		
		// Check if value is an operator object (all keys start with $)
		if (isOperatorObject(valueObj)) {
			const fragments = Object.entries(valueObj).map(([op, opValue]) =>
				translateLeafOperator(op, propertyField, opValue, schema, nestedFieldName)
			);
			return {
				sql: fragments.map(f => f.sql).join(' AND '),
				args: fragments.flatMap(f => f.args)
			};
		}
		
		// Plain object value - drill down to nested fields
		// Example: { config: { enabled: true, level: 5 } } → config.enabled = true AND config.level = 5
		const fragments = Object.entries(valueObj).map(([nestedKey, nestedValue]) => {
			const nestedField = `json_extract(value, '$.${fieldName}.${nestedKey}')`;
			return translateLeafOperator('$eq', nestedField, nestedValue, schema, `${nestedFieldName}.${nestedKey}`);
		});
		return {
			sql: fragments.map(f => f.sql).join(' AND '),
			args: fragments.flatMap(f => f.args)
		};
	}

	return translateLeafOperator('$eq', propertyField, value, schema, nestedFieldName);
}

function buildElemMatchConditions<RxDocType>(
	criteria: Record<string, unknown>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	baseFieldName: string
): SqlFragment {
	const conditions: string[] = [];
	const args: (string | number | boolean | null)[] = [];

	for (const [key, value] of Object.entries(criteria)) {
		let fragment: SqlFragment;
		
		if (isLogicalOperator(key)) {
			fragment = handleLogicalOperator(key, value, schema, baseFieldName);
		} else if (key.startsWith('$')) {
			fragment = translateLeafOperator(key, 'value', value, schema, baseFieldName);
		} else {
			fragment = handleFieldCondition(key, value, schema, baseFieldName);
		}
		
		conditions.push(fragment.sql);
		args.push(...fragment.args);
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

export function translateLeafOperator<RxDocType>(
	op: string,
	field: string,
	value: unknown,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName: string
): SqlFragment {
	switch (op) {
		case '$eq': return translateEq(field, value, schema, actualFieldName);
		case '$ne': return translateNe(field, value, schema, actualFieldName);
		case '$gt': return translateGt(field, value, schema, actualFieldName);
		case '$gte': return translateGte(field, value, schema, actualFieldName);
		case '$lt': return translateLt(field, value, schema, actualFieldName);
		case '$lte': return translateLte(field, value, schema, actualFieldName);
		case '$in': return translateIn(field, value as unknown[], schema, actualFieldName);
		case '$nin': return translateNin(field, value as unknown[], schema, actualFieldName);
		case '$exists': return translateExists(field, value as boolean);
		case '$size': return translateSize(field, value as number);
		case '$mod': {
			const result = translateMod(field, value);
			if (!result) return translateEq(field, value, schema, actualFieldName);
			return result;
		}
		case '$regex': {
			let options: string | undefined;
			let pattern: string;

			if (value instanceof RegExp) {
				pattern = value.source;
				options = value.flags;
			} else if (typeof value === 'string') {
				pattern = value;
			} else if (typeof value === 'object' && value !== null) {
				const regexObj = value as Record<string, unknown>;
				pattern = regexObj.pattern as string || regexObj.$regex as string;
				options = regexObj.$options as string | undefined;
			} else {
				return { sql: '1=0', args: [] };
			}

			const regexFragment = translateRegex(field, pattern, options, schema, actualFieldName);
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
				if (match && match[1] && match[2]) {
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
				const sqlType = typeMap[value as string];
				if (!sqlType) return { sql: '1=0', args: [] };

				if (value === 'boolean') {
					return { sql: `(type IN ('true', 'false'))`, args: [] };
				}
				if (value === 'number') {
					return { sql: `(type IN ('integer', 'real'))`, args: [] };
				}

				return { sql: `type = '${sqlType}'`, args: [] };
			}

			const typeFragment = translateType(jsonCol, path, value as string, true);
			return typeFragment || { sql: '1=0', args: [] };
		}
		default:
			return translateEq(field, value, schema, actualFieldName);
	}
}

export function wrapWithNot(innerFragment: SqlFragment): SqlFragment {
	return {
		sql: `NOT (${innerFragment.sql})`,
		args: innerFragment.args
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
