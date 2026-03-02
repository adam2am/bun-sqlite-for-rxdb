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

export function buildJsonPath(fieldName: string): string {
	const segments = fieldName.split('.');
	let path = '$';
	for (const segment of segments) {
		if (/^\d+$/.test(segment)) {
			path += `[${segment}]`;
		} else {
			path += `.${segment}`;
		}
	}
	return path;
}

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

/**
 * Adds MongoDB-compatible type guards to enforce strict BSON type boundaries.
 * Prevents SQLite's implicit type conversion from breaking query correctness.
 * 
 * @param field - SQL field expression (e.g., "json_extract(data, '$.age')")
 * @param value - Query value to compare against
 * @param comparisonSql - SQL comparison expression (e.g., "field > ?")
 * @returns SQL with type guard prepended, or original SQL if guard not needed
 */
function addTypeGuard(field: string, value: unknown, comparisonSql: string): string {
	let typeExpr = '';
	
	if (field === 'value') {
		// Inside jsonb_each, use the built-in 'type' column instead of json_type(value)
		// This prevents "malformed JSON" errors
		typeExpr = 'type';
	} else if (field.includes('json_extract')) {
		const match = field.match(/json_extract\(([^,]+),\s*'([^']+)'\)/);
		if (match) {
			const [, jsonColumn, jsonPath] = match;
			typeExpr = `json_type(${jsonColumn}, '${jsonPath}')`;
		}
	}
	
	if (!typeExpr) return comparisonSql;
	
	const valueType = typeof value;
	if (valueType === 'number') {
		return `(${typeExpr} IN ('integer', 'real') AND ${comparisonSql})`;
	}
	if (valueType === 'string') {
		return `(${typeExpr} = 'text' AND ${comparisonSql})`;
	}
	if (valueType === 'boolean') {
		return `(${typeExpr} IN ('true', 'false') AND ${comparisonSql})`;
	}
	return comparisonSql;
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
			const comparison = 'value = ?';
			const guardedSql = addTypeGuard('value', value, comparison);
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE ${guardedSql})`,
				args: [normalizeValueForSQLite(value)]
			};
		}
	}

	const comparison = `${field} = ?`;
	return { 
		sql: addTypeGuard(field, value, comparison), 
		args: [normalizeValueForSQLite(value)] 
	};
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
			const comparison = 'value = ?';
			const guardedSql = addTypeGuard('value', value, comparison);
			return {
				sql: `NOT EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE ${guardedSql})`,
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
			const comparison = 'value > ?';
			const guardedSql = addTypeGuard('value', value, comparison);
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE ${guardedSql})`,
				args: [normalizeValueForSQLite(value)]
			};
		}
	}
	const comparison = `${field} > ?`;
	return { 
		sql: addTypeGuard(field, value, comparison), 
		args: [normalizeValueForSQLite(value)] 
	};
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
			const comparison = 'value >= ?';
			const guardedSql = addTypeGuard('value', value, comparison);
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE ${guardedSql})`,
				args: [normalizeValueForSQLite(value)]
			};
		}
	}
	const comparison = `${field} >= ?`;
	return { 
		sql: addTypeGuard(field, value, comparison), 
		args: [normalizeValueForSQLite(value)] 
	};
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
			const comparison = 'value < ?';
			const guardedSql = addTypeGuard('value', value, comparison);
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE ${guardedSql})`,
				args: [normalizeValueForSQLite(value)]
			};
		}
	}
	const comparison = `${field} < ?`;
	return { 
		sql: addTypeGuard(field, value, comparison), 
		args: [normalizeValueForSQLite(value)] 
	};
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
			const comparison = 'value <= ?';
			const guardedSql = addTypeGuard('value', value, comparison);
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE ${guardedSql})`,
				args: [normalizeValueForSQLite(value)]
			};
		}
	}
	const comparison = `${field} <= ?`;
	return { 
		sql: addTypeGuard(field, value, comparison), 
		args: [normalizeValueForSQLite(value)] 
	};
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
			const inClause = `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE value IN (SELECT value FROM json_each(?)))`;
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
			const ninClause = `NOT EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE value IN (SELECT value FROM json_each(?)))`;
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
	const columnInfo = getColumnInfo(fieldName, schema);
	const isArray = field !== 'value' && columnInfo.type === 'array';
	
	if (isArray) {
		const smartResult = smartRegexToLike('value', pattern, options, schema, fieldName);
		if (smartResult) {
			return {
				sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(fieldName)}') WHERE ${smartResult.sql})`,
				args: smartResult.args
			};
		}
		return null;
	}
	
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
	let hasKeys = false;
	for (const k in obj) {
		hasKeys = true;
		if (!k.startsWith('$')) return false;
	}
	return hasKeys;
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
): SqlFragment | null {
	if (operator === '$not') {
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			const innerFragment = buildElemMatchConditions(value as Record<string, unknown>, schema, baseFieldName);
			if (!innerFragment) return null;
			return { sql: `NOT (${innerFragment.sql})`, args: innerFragment.args };
		}
		return { sql: '1=1', args: [] };
	}

	if (!Array.isArray(value)) return { sql: '1=0', args: [] };
	
	const nestedConditions = value.map(cond =>
		buildElemMatchConditions(cond as Record<string, unknown>, schema, baseFieldName)
	);
	if (nestedConditions.some(f => f === null)) return null;
	
	const joiner = operator === '$and' ? ' AND ' : (operator === '$or' ? ' OR ' : ' AND NOT ');
	const sql = nestedConditions.map(f => `(${f!.sql})`).join(joiner);
	
	return {
		sql: `(${sql})`,
		args: nestedConditions.flatMap(f => f!.args)
	};
}

function handleFieldCondition<RxDocType>(
	fieldName: string,
	value: unknown,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	baseFieldName: string
): SqlFragment | null {
	const propertyField = `json_extract(value, '${buildJsonPath(fieldName)}')`;
	const nestedFieldName = `${baseFieldName}.${fieldName}`;

	if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
		if (value instanceof RegExp) {
			return translateLeafOperator('$regex', propertyField, value, schema, nestedFieldName);
		}
		if (value instanceof Date) {
			return translateLeafOperator('$eq', propertyField, value, schema, nestedFieldName);
		}

		const valueObj = value as Record<string, unknown>;
		
		if (Object.keys(valueObj).length === 0) {
			return { sql: '1=0', args: [] };
		}
		
		// Check if value is an operator object (all keys start with $)
		if (isOperatorObject(valueObj)) {
			const fragments: SqlFragment[] = [];
			for (const [op, opValue] of Object.entries(valueObj)) {
				if (op === '$not') {
					const innerFragment = handleFieldCondition(fieldName, opValue, schema, baseFieldName);
					if (!innerFragment) return null;
					fragments.push({ sql: `NOT (${innerFragment.sql})`, args: innerFragment.args });
				} else {
					const frag = translateLeafOperator(op, propertyField, opValue, schema, nestedFieldName);
					if (!frag) return null;
					fragments.push(frag);
				}
			}
			if (fragments.some(f => f === null)) return null;
			return {
				sql: fragments.map(f => f!.sql).join(' AND '),
				args: fragments.flatMap(f => f!.args)
			};
		}
		
		// Plain object value - drill down to nested fields
		// Example: { config: { enabled: true, level: 5 } } → config.enabled = true AND config.level = 5
		const fragments = Object.entries(valueObj).map(([nestedKey, nestedValue]) => {
			const nestedField = `json_extract(value, '$.${fieldName}.${nestedKey}')`;
			return translateLeafOperator('$eq', nestedField, nestedValue, schema, `${nestedFieldName}.${nestedKey}`);
		});
		if (fragments.some(f => f === null)) return null;
		return {
			sql: fragments.map(f => f!.sql).join(' AND '),
			args: fragments.flatMap(f => f!.args)
		};
	}

	return translateLeafOperator('$eq', propertyField, value, schema, nestedFieldName);
}

function buildElemMatchConditions<RxDocType>(
	criteria: Record<string, unknown>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	baseFieldName: string
): SqlFragment | null {
	const conditions: string[] = [];
	const args: (string | number | boolean | null)[] = [];

	for (const [key, value] of Object.entries(criteria)) {
		let fragment: SqlFragment | null;
		
		if (isLogicalOperator(key)) {
			fragment = handleLogicalOperator(key, value, schema, baseFieldName);
		} else if (key.startsWith('$')) {
			fragment = translateLeafOperator(key, 'value', value, schema, baseFieldName);
		} else {
			fragment = handleFieldCondition(key, value, schema, baseFieldName);
		}
		
		if (!fragment) return null;
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
	if (typeof criteria === 'object' && criteria !== null && !Array.isArray(criteria) && Object.keys(criteria).length === 0) {
		return { sql: '1=0', args: [] };
	}

	if (typeof criteria !== 'object' || criteria === null || Array.isArray(criteria)) {
		return null;
	}

	if (criteria.$and && Array.isArray(criteria.$and)) {
		const fragments = criteria.$and.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond, schema, actualFieldName));
		if (fragments.some(f => f === null)) return null;
		const sql = fragments.map(f => `COALESCE((${f!.sql}), 0)`).join(' AND ');
		const args = fragments.flatMap(f => f!.args);
		return {
			sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE ${sql})`,
			args
		};
	}

	if (criteria.$or && Array.isArray(criteria.$or)) {
		const fragments = criteria.$or.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond, schema, actualFieldName));
		if (fragments.some(f => f === null)) return null;
		const sql = fragments.map(f => `COALESCE((${f!.sql}), 0)`).join(' OR ');
		const args = fragments.flatMap(f => f!.args);
		return {
			sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE ${sql})`,
			args
		};
	}

	if (criteria.$nor && Array.isArray(criteria.$nor)) {
		const fragments = criteria.$nor.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond, schema, actualFieldName));
		if (fragments.some(f => f === null)) return null;
		const sql = fragments.map(f => `COALESCE((${f!.sql}), 0)`).join(' OR ');
		const args = fragments.flatMap(f => f!.args);
		return {
			sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE NOT (${sql}))`,
			args
		};
	}

	const fragment = buildElemMatchConditions(criteria as Record<string, unknown>, schema, actualFieldName);
	if (!fragment) return null;
	return {
		sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(actualFieldName)}') WHERE ${asBoolean(fragment.sql)})`,
		args: fragment.args
	};
}

export function translateLeafOperator<RxDocType>(
	op: string,
	field: string,
	value: unknown,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	actualFieldName: string
): SqlFragment | null {
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
	case '$size': {
		const columnInfo = getColumnInfo(actualFieldName, schema);
		// Known non-array types → impossible (data corruption per docs/architecture/data-corruption-handling.md)
		// Unknown types → execute and let SQL handle it (matches Mingo: try, then handle result)
		if (columnInfo.type !== 'array' && columnInfo.type !== 'unknown') {
			return { sql: '1=0', args: [] };
		}
		
		// Extract column and path for two-parameter form (matches translateType pattern)
		let jsonColumn = 'data';
		let jsonPath = actualFieldName;
		let isDirectPath = false;
		
		if (field === 'value') {
			// Inside $elemMatch - use value directly
			jsonColumn = 'value';
			jsonPath = '';
			isDirectPath = true;
		}
		
		return translateSize(jsonColumn, jsonPath, value as number, isDirectPath);
	}
		case '$mod': {
			const result = translateMod(field, value);
			if (!result) return translateEq(field, value, schema, actualFieldName);
			return result;
		}
		case '$regex': {
			let pattern: string;
			let options: string | undefined;

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
				return null;
			}

			return translateRegex(field, pattern, options, schema, actualFieldName);
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

			if (Array.isArray(value)) {
				const types = value as string[];
				if (types.length === 0) return { sql: '1=0', args: [] };
				
				if (useDirectType) {
					const typeMap: Record<string, string> = {
						'null': 'null',
						'boolean': 'true',
						'number': 'integer',
						'string': 'text',
						'array': 'array',
						'object': 'object'
					};
					const conditions: string[] = [];
					for (const t of types) {
						const sqlType = typeMap[t];
						if (!sqlType) continue;
						if (t === 'boolean') conditions.push(`(type IN ('true', 'false'))`);
						else if (t === 'number') conditions.push(`(type IN ('integer', 'real'))`);
						else conditions.push(`type = '${sqlType}'`);
					}
					if (conditions.length === 0) return { sql: '1=0', args: [] };
					return { sql: `(${conditions.join(' OR ')})`, args: [] };
				} else {
					const fragments = types.map(t => translateType(jsonCol, path, t, true)).filter(f => f !== null);
					if (fragments.length === 0) return { sql: '1=0', args: [] };
					const sql = fragments.map(f => f!.sql).join(' OR ');
					return { sql: `(${sql})`, args: [] };
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

/**
 * Forces any SQL expression into strict 0/1 boolean (NULL → 0)
 * to match MongoDB/Mingo two-valued logic.
 */
function asBoolean(sql: string): string {
	return `COALESCE((${sql}), 0)`;
}

export function wrapWithNot(innerFragment: SqlFragment): SqlFragment {
	return {
		sql: `NOT (${asBoolean(innerFragment.sql)})`,
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
		case 'boolean':
		case 'bool': return { sql: `json_type(${jsonColumn}, '${jsonPath}') IN ('true', 'false')`, args: [] };
		case 'number':
		case 'int':
		case 'long':
		case 'double':
		case 'decimal': return { sql: `json_type(${jsonColumn}, '${jsonPath}') IN ('integer', 'real')`, args: [] };
		case 'string': return { sql: `COALESCE(json_type(${jsonColumn}, '${jsonPath}') = 'text', 0)`, args: [] };
		case 'array': return { sql: `json_type(${jsonColumn}, '${jsonPath}') = 'array'`, args: [] };
		case 'object': return { sql: `json_type(${jsonColumn}, '${jsonPath}') = 'object'`, args: [] };
		default: return null; // Fallback to SQL 1=0 (matches Mingo behavior)
	}
}

export function translateSize(
	jsonColumn: string,
	jsonPath: string,
	size: number,
	isDirectPath: boolean = false
): SqlFragment {
	const path = isDirectPath ? jsonPath : `$.${jsonPath}`;
	return {
		sql: `json_array_length(${jsonColumn}, '${path}') = ?`,
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
