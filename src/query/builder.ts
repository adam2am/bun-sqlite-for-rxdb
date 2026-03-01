import type { RxJsonSchema, MangoQuerySelector, RxDocumentData } from 'rxdb';
import { getColumnInfo } from './schema-mapper';
import { translateLeafOperator, wrapWithNot, translateElemMatch } from './operators';
import type { SqlFragment, ElemMatchCriteria } from './operators';
import { stableStringify } from '../utils/stable-stringify';
import type { SieveCache } from './sieve-cache';
import { getGlobalCache } from './cache';

export { getCacheSize, clearCache } from './cache';

export interface BipartiteQuery<RxDocType> {
	sqlWhere: SqlFragment | null;
	jsSelector: MangoQuerySelector<RxDocumentData<RxDocType>> | null;
}

export function buildWhereClause<RxDocType>(
	selector: MangoQuerySelector<RxDocumentData<RxDocType>>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	collectionName: string,
	cache?: Map<string, SqlFragment | null> | SieveCache<string, SqlFragment | null>
): SqlFragment | null {
	if (!selector || typeof selector !== 'object') return null;

	const actualCache = cache ?? getGlobalCache();
	const cacheKey = `v${schema.version}_${stableStringify(selector)}`;
	const cached = actualCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	const result = processSelector(selector, schema, 0);
	actualCache.set(cacheKey, result);

	return result;
}

export function buildWhereClauseWithFallback<RxDocType>(
	selector: MangoQuerySelector<RxDocumentData<RxDocType>>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	collectionName: string,
	cache?: Map<string, SqlFragment | null> | SieveCache<string, SqlFragment | null>
): BipartiteQuery<RxDocType> {
	if (!selector || typeof selector !== 'object') {
		return { sqlWhere: null, jsSelector: null };
	}

	const sqlResult = buildWhereClause(selector, schema, collectionName, cache);
	if (sqlResult) {
		return { sqlWhere: sqlResult, jsSelector: null };
	}

	const splitResult = splitSelector(selector, schema);
	return splitResult;
}

function splitSelector<RxDocType>(
	selector: MangoQuerySelector<RxDocumentData<RxDocType>>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>
): BipartiteQuery<RxDocType> {
	const sqlConditions: MangoQuerySelector<RxDocumentData<RxDocType>>[] = [];
	const jsConditions: MangoQuerySelector<RxDocumentData<RxDocType>>[] = [];

	const entries = Object.entries(selector);
	
	for (const [field, value] of entries) {
		const testSelector = { [field]: value } as MangoQuerySelector<RxDocumentData<RxDocType>>;
		const sqlFragment = processSelector(testSelector, schema, 0);
		
		if (sqlFragment) {
			sqlConditions.push(testSelector);
		} else {
			jsConditions.push(testSelector);
		}
	}

	const sqlWhere = sqlConditions.length > 0 
		? processSelector({ $and: sqlConditions } as MangoQuerySelector<RxDocumentData<RxDocType>>, schema, 0)
		: null;

	const jsSelector = jsConditions.length > 0
		? (jsConditions.length === 1 ? jsConditions[0] : { $and: jsConditions } as MangoQuerySelector<RxDocumentData<RxDocType>>)
		: null;

	return { sqlWhere, jsSelector };
}


export function buildLogicalOperator<RxDocType>(
	operator: 'or' | 'nor' | 'and',
	conditions: MangoQuerySelector<RxDocumentData<RxDocType>>[],
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	logicalDepth: number
): SqlFragment | null {
	if (conditions.length === 0) {
		return { sql: operator === 'or' ? '1=0' : '1=1', args: [] };
	}

	const fragments = conditions.map(subSelector => processSelector(subSelector, schema, logicalDepth + 1));
	if (fragments.some(f => f === null)) return null;

	const sql = fragments.map(f => `(${f!.sql})`).join(' OR ');
	const args = fragments.flatMap(f => f!.args);

	return operator === 'nor'
		? { sql: `NOT(${sql})`, args }
		: { sql, args };
}

function processSelector<RxDocType>(
	selector: MangoQuerySelector<RxDocumentData<RxDocType>>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	logicalDepth: number
): SqlFragment | null {
	if (!selector || typeof selector !== 'object') return null;

	const conditions: string[] = [];
	const args: (string | number | boolean | null)[] = [];

	for (const [field, value] of Object.entries(selector)) {
		if (field === '$and' && Array.isArray(value)) {
			const andFragments = value.map(subSelector => processSelector(subSelector, schema, logicalDepth + 1));
			if (andFragments.some(f => f === null)) return null;

			const andConditions = andFragments.map(f => f!.sql);
			const needsParens = logicalDepth > 0 && andConditions.length > 1;
			const joined = andConditions.join(' AND ');
			conditions.push(needsParens ? `(${joined})` : joined);
			andFragments.forEach(f => args.push(...f!.args));
			continue;
		}

		if (field === '$or' && Array.isArray(value)) {
			const orFragment = buildLogicalOperator('or', value, schema, logicalDepth);
			if (!orFragment) return null;

			// Wrap OR in parentheses to ensure correct precedence
			// SQL: AND (level 6) > OR (level 7)
			// Without parens: "A AND B OR C" = "(A AND B) OR C" (WRONG!)
			// With parens: "A AND (B OR C)" (CORRECT)
			conditions.push(`(${orFragment.sql})`);
			args.push(...orFragment.args);
			continue;
		}

		if (field === '$nor' && Array.isArray(value)) {
			const norFragment = buildLogicalOperator('nor', value, schema, logicalDepth);
			if (!norFragment) return null;

			conditions.push(norFragment.sql);
			args.push(...norFragment.args);
			continue;
		}

		if (field === '$not' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
			const innerFragment = processSelector(value, schema, logicalDepth + 1);
			if (!innerFragment) return null;
			conditions.push(`NOT (${innerFragment.sql})`);
			args.push(...innerFragment.args);
			continue;
		}

		const columnInfo = getColumnInfo(field, schema);
		const fieldName = columnInfo.column || `json_extract(data, '${columnInfo.jsonPath}')`;
		const actualFieldName = columnInfo.jsonPath?.replace(/^\$\./, '') || columnInfo.column || field;

		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			if (Object.keys(value).length === 0) {
				return { sql: '1=0', args: [] };
			}

			const fieldFragments: SqlFragment[] = [];

			for (const [op, opValue] of Object.entries(value)) {
				let fragment: SqlFragment;

				if (op === '$not') {
					// TOLERANT READER PATTERN (Postel's Law: Be liberal in what you accept)
					// MongoDB spec: $not requires operator expressions, rejects primitives
					// Mingo behavior: Auto-wraps primitives with $eq (more permissive)
					// Our choice: Follow Mingo to maintain RxDB ecosystem compatibility
					// Rationale: Don't break user space when switching from Memory to SQLite storage

					// 1. Handle Primitives, null, and Arrays (Mingo compatibility)
					// Examples: { $not: false } → { $not: { $eq: false } }
					//           { $not: null } → { $not: { $eq: null } }
					//           { $not: [1,2] } → { $not: { $eq: [1,2] } }
					if (typeof opValue !== 'object' || opValue === null || Array.isArray(opValue)) {
						const eqFrag = translateLeafOperator('$eq', fieldName, opValue, schema, actualFieldName);
						if (!eqFrag) return null;
						fragment = wrapWithNot(eqFrag!);

						// 2. Handle Date objects (Mingo compatibility)
						// Example: { $not: new Date('2024-01-01') } → { $not: { $eq: date } }
					} else if (opValue instanceof Date) {
						const eqFrag = translateLeafOperator('$eq', fieldName, opValue, schema, actualFieldName);
						if (!eqFrag) return null;
						fragment = wrapWithNot(eqFrag!);

						// 3. Handle RegExp objects (Mingo compatibility)
						// Example: { $not: /pattern/i } → { $not: { $regex: /pattern/i } }
					} else if (opValue instanceof RegExp) {
						const regexFrag = translateLeafOperator('$regex', fieldName, opValue, schema, actualFieldName);
						if (!regexFrag) return null;
						fragment = wrapWithNot(regexFrag!);

						// 4. Handle Objects (operator expressions, plain objects, empty objects)
					} else {
						const opValueObj = opValue as Record<string, unknown>;
						const innerKeys = Object.keys(opValueObj);

						// 5. Reject Empty Objects (Corrupted Data)
						// Example: { $not: {} } → No operators to negate → Impossible condition
						if (innerKeys.length === 0) {
							fragment = { sql: '1=0', args: [] };

							// 6. Handle Nested Logical Operators ($and/$or/$nor)
							// EXTENDED MONGODB SYNTAX SUPPORT
							// Pattern: { age: { $not: { $or: [{ $and: [...] }, { $eq: 35 }] } } }
							// MongoDB/Mingo: Do NOT support this (logical operators are root-level only)
							// RxDB: Passes queries AS-IS to storage (normalizeMangoQuery incomplete)
							// Our approach: Transform to valid SQL via recursive wrapping
							// Rationale: Better UX, semantically correct, consistent with TOLERANT READER pattern
						} else if (innerKeys.some(k => k === '$and' || k === '$or' || k === '$nor')) {
							const logicalOp = innerKeys[0] as '$and' | '$or' | '$nor';
							const nestedSelector = opValueObj as unknown as MangoQuerySelector<RxDocumentData<RxDocType>>;
							const items = nestedSelector[logicalOp]!;

							const LOGICAL_OPS = new Set(['$and', '$or', '$nor']);

							// Recursively wrap leaf operators with field name
							// { $or: [{ $and: [{ $gt: 20 }] }] } → { $or: [{ $and: [{ age: { $gt: 20 } }] }] }
							function recursivelyWrapLeafOperators(items: any[], field: string): any[] {
								return items.map(item => {
									const keys = Object.keys(item);
									if (keys.some(k => !k.startsWith('$'))) return item;
									if (keys.length === 1 && LOGICAL_OPS.has(keys[0])) {
										const logicalOp = keys[0];
										return { [logicalOp]: recursivelyWrapLeafOperators(item[logicalOp], field) };
									}
									return { [field]: item };
								});
							}

							const wrappedItems = recursivelyWrapLeafOperators(items, field);

							const innerFragment = processSelector({ [logicalOp]: wrappedItems } as MangoQuerySelector<RxDocumentData<RxDocType>>, schema, logicalDepth + 1);
							if (!innerFragment) return null;
							fragment = wrapWithNot(innerFragment);

							// 7. Handle $elemMatch
							// Example: { $not: { $elemMatch: {...} } } → Negate array match
						} else if (innerKeys.length === 1 && innerKeys[0] === '$elemMatch') {
							const elemMatchFragment = translateElemMatch(fieldName, opValueObj.$elemMatch as ElemMatchCriteria, schema, actualFieldName);
							if (!elemMatchFragment) return null;
							fragment = wrapWithNot(elemMatchFragment);

							// 8. Distinguish: Operator Expressions vs Plain Objects
						} else {
							const hasOperators = innerKeys.some(k => k.startsWith('$'));
							if (!hasOperators) {
								// Plain object without operators → Wrap with $eq (Mingo compatibility)
								// Example: { $not: { a: 1 } } → NOT (field = {a:1})
								const eqFrag = translateLeafOperator('$eq', fieldName, opValueObj, schema, actualFieldName);
								if (!eqFrag) return null;
								fragment = wrapWithNot(eqFrag!);
							} else {
								// Has operators → Process normally
								// Example: { $not: { $gt: 5 } } → NOT (field > 5)
								const [[innerOp, innerVal]] = Object.entries(opValueObj);
								const innerFrag = translateLeafOperator(innerOp, fieldName, innerVal, schema, actualFieldName);
								if (!innerFrag) return null;
								fragment = wrapWithNot(innerFrag!);
							}
						}
					}
				} else if (op === '$elemMatch') {
					const elemMatchFragment = translateElemMatch(fieldName, opValue as ElemMatchCriteria, schema, actualFieldName);
					if (!elemMatchFragment) return null;
					fragment = elemMatchFragment;
				} else if (op === '$regex') {
					// Handle $regex with optional $options sibling
					// MongoDB allows: { field: { $regex: 'pattern', $options: 'i' } }
					const regexValue = opValue;
					const optionsValue = (value as Record<string, unknown>).$options as string | undefined;

					let combinedValue: unknown;
					if (typeof regexValue === 'string' && optionsValue) {
						combinedValue = { $regex: regexValue, $options: optionsValue };
					} else {
						combinedValue = regexValue;
					}

					const leafFrag = translateLeafOperator('$regex', fieldName, combinedValue, schema, actualFieldName);
					if (!leafFrag) return null;
					fragment = leafFrag;
				} else if (op === '$options') {
					// Skip $options - it's handled together with $regex
					continue;
				} else if (!op.startsWith('$')) {
					const jsonPath = `json_extract(${fieldName}, '$.${op}')`;
					const nestedFieldName = `${actualFieldName}.${op}`;
					const leafFrag = translateLeafOperator('$eq', jsonPath, opValue, schema, nestedFieldName);
					if (!leafFrag) return null;
					fragment = leafFrag;
				} else {
					const leafFrag = translateLeafOperator(op, fieldName, opValue, schema, actualFieldName);
					if (!leafFrag) return null;
					fragment = leafFrag;
				}

				if (fieldFragments.length > 0) {
					const prev = fieldFragments.pop()!;
					fieldFragments.push({
						sql: `(${prev.sql} AND ${fragment.sql})`,
						args: [...prev.args, ...fragment.args]
					});
				} else {
					fieldFragments.push(fragment);
				}
			}

			fieldFragments.forEach(f => {
				conditions.push(f.sql);
				args.push(...f.args);
			});
		} else {
			const fragment = translateLeafOperator('$eq', fieldName, value, schema, actualFieldName);
			if (!fragment) return null;
			conditions.push(fragment.sql);
			args.push(...fragment.args);
		}
	}

	const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
	return { sql: where, args };
}
