import type { RxJsonSchema, RxDocumentData } from 'rxdb';

export interface SqlFragment {
	sql: string;
	args: (string | number | boolean | null)[];
}

type QueryValue = string | number | boolean | null;
type OperatorExpression = { [key: string]: unknown };
export type ElemMatchCriteria = QueryValue | OperatorExpression;

import { smartRegexToLike } from './smart-regex';

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

function buildElemMatchConditions(criteria: Record<string, unknown>): SqlFragment {
	const conditions: string[] = [];
	const args: (string | number | boolean | null)[] = [];

	for (const [key, value] of Object.entries(criteria)) {
		if (key.startsWith('$')) {
			const fragment = processOperatorValue('json_each.value', { [key]: value });
			conditions.push(fragment.sql);
			args.push(...fragment.args);
		} else {
			const propertyField = `json_extract(json_each.value, '$.${key}')`;
			const fragment = processOperatorValue(propertyField, value);
			conditions.push(fragment.sql);
			args.push(...fragment.args);
		}
	}

	return {
		sql: conditions.length > 0 ? conditions.join(' AND ') : '1=1',
		args
	};
}

export function translateElemMatch(field: string, criteria: ElemMatchCriteria): SqlFragment | null {
	if (typeof criteria !== 'object' || criteria === null) {
		return {
			sql: `EXISTS (SELECT 1 FROM json_each(${field}) WHERE json_each.value = ?)`,
			args: [criteria as string | number | boolean]
		};
	}

	if (criteria.$and && Array.isArray(criteria.$and)) {
		const fragments = criteria.$and.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond));
		const sql = fragments.map(f => f.sql).join(' AND ');
		const args = fragments.flatMap(f => f.args);
		return {
			sql: `EXISTS (SELECT 1 FROM json_each(${field}) WHERE ${sql})`,
			args
		};
	}

	if (criteria.$or && Array.isArray(criteria.$or)) {
		const fragments = criteria.$or.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond));
		const sql = fragments.map(f => f.sql).join(' OR ');
		const args = fragments.flatMap(f => f.args);
		return {
			sql: `EXISTS (SELECT 1 FROM json_each(${field}) WHERE ${sql})`,
			args
		};
	}

	if (criteria.$nor && Array.isArray(criteria.$nor)) {
		const fragments = criteria.$nor.map((cond: Record<string, unknown>) => buildElemMatchConditions(cond));
		const sql = fragments.map(f => f.sql).join(' OR ');
		const args = fragments.flatMap(f => f.args);
		return {
			sql: `EXISTS (SELECT 1 FROM json_each(${field}) WHERE NOT (${sql}))`,
			args
		};
	}

	const fragment = buildElemMatchConditions(criteria as Record<string, unknown>);
	if (fragment.sql === '1=1') {
		return null;
	}

	return {
		sql: `EXISTS (SELECT 1 FROM json_each(${field}) WHERE ${fragment.sql})`,
		args: fragment.args
	};
}

function processOperatorValue(field: string, value: unknown): SqlFragment {
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

export function translateNot(field: string, criteria: unknown): SqlFragment | null {
	if (!criteria || (typeof criteria === 'object' && Object.keys(criteria).length === 0)) return null;
	const inner = processOperatorValue(field, criteria);
	return {
		sql: `NOT(${inner.sql})`,
		args: inner.args
	};
}

export function translateType(
	jsonColumn: string,
	fieldName: string,
	type: string
): SqlFragment | null {
	const jsonPath = `$.${fieldName}`;

	switch (type) {
		case 'null': return { sql: `json_type(${jsonColumn}, '${jsonPath}') = 'null'`, args: [] };
		case 'boolean': return { sql: `json_type(${jsonColumn}, '${jsonPath}') IN ('true', 'false')`, args: [] };
		case 'number': return { sql: `json_type(${jsonColumn}, '${jsonPath}') IN ('integer', 'real')`, args: [] };
		case 'string': return { sql: `json_type(${jsonColumn}, '${jsonPath}') = 'text'`, args: [] };
		case 'array': return { sql: `json_type(${jsonColumn}, '${jsonPath}') = 'array'`, args: [] };
		case 'object': return { sql: `json_type(${jsonColumn}, '${jsonPath}') = 'object'`, args: [] };
		default: return null;
	}
}

export function translateSize(field: string, size: number): SqlFragment {
	return {
		sql: `json_array_length(${field}) = ?`,
		args: [size]
	};
}

export function translateMod(field: string, value: unknown): SqlFragment | null {
	if (!Array.isArray(value) || value.length !== 2) return null;
	const [divisor, remainder] = value;
	return {
		sql: `${field} % ? = ?`,
		args: [divisor, remainder]
	};
}
