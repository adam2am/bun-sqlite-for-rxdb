import type { RxJsonSchema, RxDocumentData } from 'rxdb';
import { getColumnInfo } from './schema-mapper';
import { smartRegexToLike } from './smart-regex';
import { addTypeGuard } from './type-guards';

export interface SqlFragment {
	sql: string;
	args: (string | number | boolean | null)[];
}

type QueryValue = string | number | boolean | null;
type OperatorExpression = { [key: string]: unknown };
export type ElemMatchCriteria = QueryValue | OperatorExpression;

export function buildJsonPath(fieldName: string, schema?: RxJsonSchema<any>): string {
	const segments = fieldName.split('.');
	let path = '$';
	
	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		
		// FIX GAP 43: Handle empty key names
		if (segment === '') {
			const escaped = segment.replace(/"/g, '""');
			path += `."${escaped}"`;
			continue;
		}
		
		if (/^\d+$/.test(segment)) {
			// Determine if this is an object key or array index
			if (schema) {
				const parentPath = segments.slice(0, i).join('.');
				const parentInfo = parentPath ? getColumnInfo(parentPath, schema) : { type: 'unknown' };
				
				if (parentInfo.type === 'object') {
					// Numeric object key - use quoted syntax
					path += `."${segment}"`;
				} else if (parentInfo.type === 'array') {
					// Array index - use bracket syntax
					path += `[${segment}]`;
				} else {
					// Unknown - use bracket (default behavior)
					path += `[${segment}]`;
				}
			} else {
				// No schema - default to array index
				path += `[${segment}]`;
			}
		} else {
			const escaped = segment.replace(/'/g, "''");
			path += `.${escaped}`;
		}
	}
	return path;
}

function normalizeValueForSQLite(value: unknown): string | number | boolean | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	if (value instanceof RegExp) {
		return JSON.stringify({ source: value.source, flags: value.flags });
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (typeof value === 'object') {
		return JSON.stringify(value);
	}
	return String(value);
}

function isArrayOrObject(value: unknown): boolean {
	return Array.isArray(value) || (typeof value === 'object' && value !== null && !(value instanceof Date));
}

function getTypeExpression(field: string): string {
	if (field === 'value') {
		return 'type';
	}
	
	if (field.includes('json_extract(json(value)') || field.includes('json_extract(value')) {
		return '';
	}
	
	const match = field.match(/json_extract\(([^,]+),\s*'([^']+)'\)/);
	if (match) {
		const [, jsonColumn, jsonPath] = match;
		const needsJsonNormalization = jsonColumn === 'value' && jsonPath && jsonPath !== '$';
		const safeColumn = needsJsonNormalization ? `json(${jsonColumn})` : jsonColumn;
		return `json_type(${safeColumn}, '${jsonPath}')`;
	}
	
	return '';
}

export function translateEq(field: string, value: unknown): SqlFragment | null {
	if (value === null) {
		// FIX GAP 51: Ensure NULL matches only actual JSON null or missing fields
		// Extract field name from json_extract expression
		const fieldMatch = field.match(/json_extract\([^,]+,\s*'\$\.([^']+)'\)/);
		if (fieldMatch) {
			const actualFieldName = fieldMatch[1];
			return { 
				sql: `(json_type(data, '$.${actualFieldName}') = 'null' OR json_type(data, '$.${actualFieldName}') IS NULL)`, 
				args: [] 
			};
		}
		return { sql: `${field} IS NULL`, args: [] };
	}

	if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof RegExp)) {
		return null;
	}

	if (Array.isArray(value)) {
		try {
			return {
				sql: `${field} = json(?)`,
				args: [JSON.stringify(value)]
			};
		} catch (e) {
			return { sql: '1=0', args: [] };
		}
	}

	const comparison = `${field} = ?`;
	return { 
		sql: addTypeGuard(field, value, comparison), 
		args: [normalizeValueForSQLite(value)] 
	};
}

export function translateNe(field: string, value: unknown): SqlFragment {
	if (value === null) {
		return { sql: `${field} IS NOT NULL`, args: [] };
	}
	return { sql: `(${field} <> ? OR ${field} IS NULL)`, args: [normalizeValueForSQLite(value)] };
}

export function translateGt(field: string, value: unknown): SqlFragment | null {
	if (isArrayOrObject(value)) return null;
	const comparison = `${field} > ?`;
	return { 
		sql: addTypeGuard(field, value, comparison), 
		args: [normalizeValueForSQLite(value)] 
	};
}

export function translateGte(field: string, value: unknown): SqlFragment | null {
	if (isArrayOrObject(value)) return null;
	const comparison = `${field} >= ?`;
	return { 
		sql: addTypeGuard(field, value, comparison), 
		args: [normalizeValueForSQLite(value)] 
	};
}

export function translateLt(field: string, value: unknown): SqlFragment | null {
	if (isArrayOrObject(value)) return null;
	const comparison = `${field} < ?`;
	return { 
		sql: addTypeGuard(field, value, comparison), 
		args: [normalizeValueForSQLite(value)] 
	};
}

export function translateLte(field: string, value: unknown): SqlFragment | null {
	if (isArrayOrObject(value)) return null;
	const comparison = `${field} <= ?`;
	return { 
		sql: addTypeGuard(field, value, comparison), 
		args: [normalizeValueForSQLite(value)] 
	};
}

export function translateIn(field: string, values: unknown[]): SqlFragment | null {
	if (!Array.isArray(values) || values.length === 0) {
		return { sql: '1=0', args: [] };
	}
	
	if (values.some(v => v instanceof RegExp || (typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)))) {
		return null;
	}
	
	const hasNull = values.includes(null);
	const nonNullValues = values.filter(v => v !== null).map(v => normalizeValueForSQLite(v));

	if (nonNullValues.length === 0) {
		return { sql: `${field} IS NULL`, args: [] };
	}

	try {
		const typeExpr = getTypeExpression(field);
		
		const useSimpleIn = !typeExpr || field.includes('json_extract(json(value)') || field.includes('json_extract(value');
		
		const inClause = useSimpleIn
			? `${field} IN (SELECT value FROM json_each(?))`
			: `EXISTS (SELECT 1 FROM json_each(?) je WHERE je.value = ${field} AND je.type = ${typeExpr})`;
		
		const args = [JSON.stringify(nonNullValues)];
		return hasNull ? { sql: `(${inClause} OR ${field} IS NULL)`, args } : { sql: inClause, args };
	} catch (e) {
		return { sql: '1=0', args: [] };
	}
}

export function translateNin(field: string, values: unknown[]): SqlFragment | null {
	if (!Array.isArray(values) || values.length === 0) {
		return { sql: '1=1', args: [] };
	}
	
	if (values.some(v => v instanceof RegExp || (typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)))) {
		return null;
	}
	
	const hasNull = values.includes(null);
	const nonNullValues = values.filter(v => v !== null).map(v => normalizeValueForSQLite(v));

	if (nonNullValues.length === 0) {
		return { sql: `${field} IS NOT NULL`, args: [] };
	}

	try {
		const typeExpr = getTypeExpression(field);
		
		const useSimpleIn = !typeExpr || field.includes('json_extract(json(value)') || field.includes('json_extract(value');
		
		const ninClause = useSimpleIn
			? `${field} NOT IN (SELECT value FROM json_each(?))`
			: `NOT EXISTS (SELECT 1 FROM json_each(?) je WHERE je.value = ${field} AND je.type = ${typeExpr})`;
		
		const args = [JSON.stringify(nonNullValues)];
		return hasNull ? { sql: `(${ninClause} AND ${field} IS NOT NULL)`, args } : { sql: `(${field} IS NULL OR ${ninClause})`, args };
	} catch (e) {
		return { sql: '1=1', args: [] };
	}
}

export function translateExists(field: string, exists: boolean): SqlFragment {
	const typeExpr = getTypeExpression(field);
	
	if (!typeExpr) {
		return {
			sql: exists ? `${field} IS NOT NULL` : `${field} IS NULL`,
			args: []
		};
	}
	
	return {
		sql: exists ? `${typeExpr} IS NOT NULL` : `${typeExpr} IS NULL`,
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
				sql: `EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(fieldName, schema)}') WHERE ${smartResult.sql})`,
				args: smartResult.args
			};
		}
		return null;
	}
	
	if (field !== 'value' && columnInfo.type === 'unknown' && !fieldName.includes('.')) {
		const isInternalField = fieldName === schema.primaryKey || fieldName.startsWith('_');
		if (!isInternalField) {
			const scalarMatch = smartRegexToLike(field, pattern, options, schema, fieldName);
			const arrayMatch = smartRegexToLike('value', pattern, options, schema, fieldName);
			
			if (scalarMatch && arrayMatch) {
				return {
					sql: `(${scalarMatch.sql} OR EXISTS (SELECT 1 FROM jsonb_each(data, '${buildJsonPath(fieldName, schema)}') WHERE ${arrayMatch.sql}))`,
					args: [...scalarMatch.args, ...arrayMatch.args]
				};
			}
			return null;
		}
	}
	
	const smartResult = smartRegexToLike(field, pattern, options, schema, fieldName);
	if (smartResult) return smartResult;

	return null;
}

// Operator classification for O(1) lookups
const LOGICAL_OPERATORS = new Set(['$and', '$or', '$nor', '$not']);
const LEAF_OPERATORS = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists', '$regex', '$type', '$size', '$mod', '$elemMatch', '$all']);

// WHITELIST FIREWALL: Supported SQL operators
// Unknown operators return null to trigger Mingo fallback (prevents GAP 2: unsupported operator trap)
const SUPPORTED_SQL_OPS = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists', '$regex', '$type', '$size', '$mod', '$elemMatch', '$all']);

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
	const jsonPath = buildJsonPath(fieldName, schema);
	const propertyField = `json_extract(json(value), '${jsonPath}')`;
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

	const jsonPath = buildJsonPath(actualFieldName, schema);
	
	const target = field === 'value' ? 'value' : `data, '${jsonPath}'`;
	const typeCheck = field === 'value' ? `type = 'array'` : `json_type(${target}) = 'array'`;

	if (criteria.$and && Array.isArray(criteria.$and)) {
		const fragments = criteria.$and.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond, schema, actualFieldName));
		if (fragments.some(f => f === null)) return null;
		const sql = fragments.map(f => `COALESCE((${f!.sql}), 0)`).join(' AND ');
		const args = fragments.flatMap(f => f!.args);
		return {
			sql: `(${typeCheck} AND EXISTS (SELECT 1 FROM jsonb_each(${target}) WHERE json_type(value) = 'object' AND ${sql}))`,
			args
		};
	}

	if (criteria.$or && Array.isArray(criteria.$or)) {
		const fragments = criteria.$or.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond, schema, actualFieldName));
		if (fragments.some(f => f === null)) return null;
		const sql = fragments.map(f => `COALESCE((${f!.sql}), 0)`).join(' OR ');
		const args = fragments.flatMap(f => f!.args);
		return {
			sql: `(${typeCheck} AND EXISTS (SELECT 1 FROM jsonb_each(${target}) WHERE json_type(value) = 'object' AND ${sql}))`,
			args
		};
	}

	if (criteria.$nor && Array.isArray(criteria.$nor)) {
		const fragments = criteria.$nor.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond, schema, actualFieldName));
		if (fragments.some(f => f === null)) return null;
		const sql = fragments.map(f => `COALESCE((${f!.sql}), 0)`).join(' OR ');
		const args = fragments.flatMap(f => f!.args);
		return {
			sql: `(${typeCheck} AND EXISTS (SELECT 1 FROM jsonb_each(${target}) WHERE json_type(value) = 'object' AND NOT (${sql})))`,
			args
		};
	}

	const fragment = buildElemMatchConditions(criteria as Record<string, unknown>, schema, actualFieldName);
	if (!fragment) return null;
	
	const hasNestedFields = Object.keys(criteria).some(k => !k.startsWith('$'));
	const objectGuard = hasNestedFields ? `json_type(value) = 'object' AND ` : '';
	
	return {
		sql: `(${typeCheck} AND EXISTS (SELECT 1 FROM jsonb_each(${target}) WHERE ${objectGuard}${asBoolean(fragment.sql)}))`,
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
	if (!SUPPORTED_SQL_OPS.has(op)) {
		return null;
	}

	const columnInfo = getColumnInfo(actualFieldName, schema);
	const isRawColumn = !!columnInfo.column;

	if (isRawColumn && value !== null && value !== undefined) {
		const valueType = Array.isArray(value) ? 'array' : typeof value;
		const schemaType = String(columnInfo.type);
		
		if (schemaType !== valueType && schemaType !== 'unknown') {
			if (['$eq', '$gt', '$gte', '$lt', '$lte', '$in', '$mod', '$regex'].includes(op)) {
				return { sql: '1=0', args: [] };
			}
			if (['$ne', '$nin'].includes(op)) {
				return { sql: '1=1', args: [] };
			}
		}
	}

	if (op === '$type' && isRawColumn) {
		const targetTypes = Array.isArray(value) ? value : [value];
		const schemaType = String(columnInfo.type);
		const match = targetTypes.some(t => {
			const typeStr = String(t);
			if (typeStr === 'string' || typeStr === '2') return schemaType === 'string';
			if (['number', '1', '16', '18', '19'].includes(typeStr)) return schemaType === 'number';
			if (typeStr === 'boolean' || typeStr === '8') return schemaType === 'boolean';
			if (typeStr === 'array' || typeStr === '4') return schemaType === 'array';
			if (typeStr === 'object' || typeStr === '3') return schemaType === 'object';
			return false;
		});
		return { sql: match ? '1=1' : '1=0', args: [] };
	}

	// Special operators that don't use standard array traversal
	if (op === '$size') {
		if (columnInfo.type !== 'array' && columnInfo.type !== 'unknown') {
			return { sql: '1=0', args: [] };
		}
		
		let jsonColumn = 'data';
		let jsonPath = actualFieldName;
		let isDirectPath = false;
		
		if (field === 'value') {
			jsonColumn = 'value';
			jsonPath = '';
			isDirectPath = true;
		}
		
		const path = isDirectPath ? jsonPath : `$.${jsonPath}`;
		if (columnInfo.type === 'array' && !isDirectPath) {
			return {
				sql: `json_array_length(${jsonColumn}, '${path}') = ?`,
				args: [value as number]
			};
		}
		return translateSize(jsonColumn, jsonPath, value as number, isDirectPath);
	}

	if (op === '$elemMatch') {
		// Detect nested $elemMatch (depth > 1) and fallback to Mingo to avoid column shadowing
		if (field === 'value') {
			return null;
		}
		return translateElemMatch(field, value as ElemMatchCriteria, schema, actualFieldName);
	}

	if (op === '$exists') {
		return translateExists(field, value as boolean);
	}

	if (op === '$regex') {
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

	if (op === '$type') {
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
					'null': 'null', 'boolean': 'true', 'number': 'integer',
					'string': 'text', 'array': 'array', 'object': 'object'
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
				'null': 'null', 'boolean': 'true', 'number': 'integer',
				'string': 'text', 'array': 'array', 'object': 'object'
			};
			const sqlType = typeMap[value as string];
			if (!sqlType) return { sql: '1=0', args: [] };

			if (value === 'boolean') return { sql: `(type IN ('true', 'false'))`, args: [] };
			if (value === 'number') return { sql: `(type IN ('integer', 'real'))`, args: [] };
			return { sql: `type = '${sqlType}'`, args: [] };
		}

		const typeFragment = translateType(jsonCol, path, value as string, true);
		return typeFragment || { sql: '1=0', args: [] };
	}

	if (op === '$all') {
		if (!Array.isArray(value) || value.length === 0) return { sql: '1=0', args: [] };
		
		const jsonPath = buildJsonPath(actualFieldName, schema);
		const target = field === 'value' ? 'value' : `data, '${jsonPath}'`;
		const arrayCheck = field === 'value' ? `type = 'array'` : `json_type(${target}) = 'array'`;
		const fragments: SqlFragment[] = [];
		const depth = Math.max(1, actualFieldName.split('.').length - 1);
		
		for (const val of value) {
			if (val instanceof RegExp) {
				const frag = translateRegex('value', val.source, val.flags, schema, actualFieldName);
				if (!frag) return null;
				fragments.push(wrapWithArrayTraversal(frag, jsonPath, '$eq', depth));
			} else if (typeof val === 'object' && val !== null && !Array.isArray(val) && '$elemMatch' in val) {
				const frag = translateElemMatch(field, (val as { $elemMatch: ElemMatchCriteria }).$elemMatch, schema, actualFieldName);
				if (!frag) return null;
				fragments.push(frag);
			} else {
				const frag = translateEq('value', val);
				if (!frag) return null;
				fragments.push(wrapWithArrayTraversal(frag, jsonPath, '$eq', depth));
			}
		}
		return {
			sql: `(${arrayCheck} AND ${fragments.map(f => f.sql).join(' AND ')})`,
			args: fragments.flatMap(f => f.args)
		};
	}

	// Standard operators with centralized array traversal
	let scalarFragment: SqlFragment | null = null;
	let elementFragment: SqlFragment | null = null;

	switch (op) {
		case '$eq':
			scalarFragment = translateEq(field, value);
			elementFragment = translateEq('value', value);
			break;
		case '$ne':
			scalarFragment = translateNe(field, value);
			elementFragment = translateEq('value', value);
			break;
		case '$gt':
			scalarFragment = translateGt(field, value);
			elementFragment = translateGt('value', value);
			break;
		case '$gte':
			scalarFragment = translateGte(field, value);
			elementFragment = translateGte('value', value);
			break;
		case '$lt':
			scalarFragment = translateLt(field, value);
			elementFragment = translateLt('value', value);
			break;
		case '$lte':
			scalarFragment = translateLte(field, value);
			elementFragment = translateLte('value', value);
			break;
		case '$in':
			scalarFragment = translateIn(field, value as unknown[]);
			elementFragment = translateIn('value', value as unknown[]);
			break;
		case '$nin':
			scalarFragment = translateNin(field, value as unknown[]);
			elementFragment = translateIn('value', value as unknown[]);
			break;
	case '$mod':
		scalarFragment = translateMod(field, value);
		elementFragment = translateMod('value', value);
		break;
}

	if (!scalarFragment) return null;

	// Check if array traversal is needed
	if (field === 'value' || !schema || !actualFieldName) {
		return scalarFragment;
	}

	const isInternalField = actualFieldName === schema.primaryKey || actualFieldName.startsWith('_');
	if (isInternalField || actualFieldName.includes('.')) {
		return scalarFragment;
	}

	if (columnInfo.type !== 'array' && columnInfo.type !== 'unknown') {
		return scalarFragment;
	}

	if (!elementFragment) return null;

	const jsonPath = buildJsonPath(actualFieldName, schema);
	const depth = Math.max(1, actualFieldName.split('.').length - 1);
	const arrayTraversal = wrapWithArrayTraversal(elementFragment, jsonPath, op, depth);
	const arrayTypeCheck = `json_type(data, '${jsonPath}') = 'array'`;
	const scalarNotArray = `(json_type(data, '${jsonPath}') IS NULL OR json_type(data, '${jsonPath}') != 'array')`;

	if (op === '$ne' || op === '$nin') {
		return {
			sql: `((${scalarNotArray} AND ${scalarFragment.sql}) OR (${arrayTypeCheck} AND ${arrayTraversal.sql}))`,
			args: [...scalarFragment.args, ...arrayTraversal.args]
		};
	} else {
		return {
			sql: `(${scalarFragment.sql} OR (${arrayTypeCheck} AND ${arrayTraversal.sql}))`,
			args: [...scalarFragment.args, ...arrayTraversal.args]
		};
	}
}

function wrapWithArrayTraversal(elementFragment: SqlFragment, jsonPath: string, op: string, depth: number = 1): SqlFragment {
	const replacedSql = elementFragment.sql.replace(/= value\b/g, '= flattened.value').replace(/= type\b/g, '= flattened.type');
	
	const flattenCte = `
		WITH RECURSIVE flattened(value, type, depth_remaining) AS (
			SELECT jsonb_each.value, jsonb_each.type, ${depth}
			FROM jsonb_each(data, '${jsonPath}')
			UNION ALL
			SELECT jsonb_each.value, jsonb_each.type, flattened.depth_remaining - 1
			FROM flattened, jsonb_each(flattened.value)
			WHERE flattened.type = 'array' AND flattened.depth_remaining > 0
		)
	`;
	
	const existsSql = `EXISTS (${flattenCte} SELECT 1 FROM flattened WHERE ${replacedSql})`;
	
	if (op === '$ne' || op === '$nin') {
		return {
			sql: `NOT ${existsSql}`,
			args: elementFragment.args
		};
	}
	
	return {
		sql: existsSql,
		args: elementFragment.args
	};
}

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
	type: string | number,
	isDirectPath: boolean = false
): SqlFragment | null {
	const jsonPath = isDirectPath ? fieldName : `$.${fieldName}`;

	let typeStr = String(type);
	const bsonMap: Record<string, string> = {
		'1': 'number', '2': 'string', '3': 'object', '4': 'array',
		'8': 'boolean', '9': 'date', '10': 'null', '16': 'number', '18': 'number', '19': 'number'
	};
	if (bsonMap[typeStr]) typeStr = bsonMap[typeStr];

	const needsJsonNormalization = jsonColumn === 'value' && jsonPath && jsonPath !== '';
	const safeColumn = needsJsonNormalization ? `json(${jsonColumn})` : jsonColumn;

	switch (typeStr) {
		case 'null': return { sql: `json_type(${safeColumn}, '${jsonPath}') = 'null'`, args: [] };
		case 'boolean':
		case 'bool': return { sql: `json_type(${safeColumn}, '${jsonPath}') IN ('true', 'false')`, args: [] };
		case 'number':
		case 'int':
		case 'long':
		case 'double':
		case 'decimal': return { sql: `json_type(${safeColumn}, '${jsonPath}') IN ('integer', 'real')`, args: [] };
		case 'string': return { sql: `COALESCE(json_type(${safeColumn}, '${jsonPath}') = 'text', 0)`, args: [] };
	case 'date': 
		// FIX GAP 8: BSON type 9 (date) - Match ISO 8601 date strings (both YYYY-MM-DD and YYYY-MM-DDTHH:MM:SS.sssZ)
		return { sql: `(json_type(${safeColumn}, '${jsonPath}') = 'text' AND json_extract(${safeColumn}, '${jsonPath}') GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]*')`, args: [] };
		case 'array': return { sql: `json_type(${safeColumn}, '${jsonPath}') = 'array'`, args: [] };
		case 'object': return { sql: `json_type(${safeColumn}, '${jsonPath}') = 'object'`, args: [] };
		default: return null;
	}
}

export function translateSize(
	jsonColumn: string,
	jsonPath: string,
	size: number,
	isDirectPath: boolean = false
): SqlFragment {
	const path = isDirectPath ? jsonPath : `$.${jsonPath}`;
	
	if (isDirectPath && jsonPath === '') {
		return {
			sql: `(type = 'array' AND json_array_length(${jsonColumn}) = ?)`,
			args: [size]
		};
	}
	
	return {
		sql: `(json_type(${jsonColumn}, '${path}') = 'array' AND json_array_length(${jsonColumn}, '${path}') = ?)`,
		args: [size]
	};
}

export function translateMod(field: string, value: unknown): SqlFragment | null {
	if (!Array.isArray(value) || value.length !== 2) return { sql: '1=0', args: [] };
	const [divisor, remainder] = value;
	
	// Float modulo: SQLite's CAST AS INTEGER loses precision
	// Bailout to JS for float divisors/remainders (rare edge case)
	if (typeof divisor === 'number' && !Number.isInteger(divisor)) return null;
	if (typeof remainder === 'number' && !Number.isInteger(remainder)) return null;
	
	const comparison = `(${field} - (CAST(${field} / ? AS INTEGER) * ?)) = ?`;
	return { 
		sql: addTypeGuard(field, 0, comparison), 
		args: [divisor, divisor, remainder] 
	};
}
