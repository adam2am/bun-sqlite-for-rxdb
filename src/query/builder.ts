import type { RxJsonSchema, MangoQuerySelector, RxDocumentData } from 'rxdb';
import { getColumnInfo } from './schema-mapper';
import { translateLeafOperator, wrapWithNot, translateElemMatch } from './operators';
import type { SqlFragment, ElemMatchCriteria } from './operators';
import { stableStringify } from '../utils/stable-stringify';

const QUERY_CACHE = new Map<string, SqlFragment | null>();
const MAX_CACHE_SIZE = 1000;

export function getCacheSize(): number {
	return QUERY_CACHE.size;
}

export function clearCache(): void {
	QUERY_CACHE.clear();
}

export function buildWhereClause<RxDocType>(
	selector: MangoQuerySelector<RxDocumentData<RxDocType>>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	collectionName: string
): SqlFragment | null {
	if (!selector || typeof selector !== 'object') return null;
	
	const cacheKey = `v${schema.version}_${collectionName}_${stableStringify(selector)}`;

	const cached = QUERY_CACHE.get(cacheKey);
	if (cached) {
		QUERY_CACHE.delete(cacheKey);
		QUERY_CACHE.set(cacheKey, cached);
		return cached;
	}

	const result = processSelector(selector, schema, 0);
	if (!result) return null;

	if (QUERY_CACHE.size >= MAX_CACHE_SIZE) {
		const firstKey = QUERY_CACHE.keys().next().value;
		if (firstKey) QUERY_CACHE.delete(firstKey);
	}

	QUERY_CACHE.set(cacheKey, result);
	return result;
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
					fragment = wrapWithNot(eqFrag);
				
				// 2. Handle Date objects (Mingo compatibility)
				// Example: { $not: new Date('2024-01-01') } → { $not: { $eq: date } }
				} else if (opValue instanceof Date) {
					const eqFrag = translateLeafOperator('$eq', fieldName, opValue, schema, actualFieldName);
					fragment = wrapWithNot(eqFrag);
				
				// 3. Handle RegExp objects (Mingo compatibility)
				// Example: { $not: /pattern/i } → { $not: { $regex: /pattern/i } }
				} else if (opValue instanceof RegExp) {
					const regexFrag = translateLeafOperator('$regex', fieldName, opValue, schema, actualFieldName);
					fragment = wrapWithNot(regexFrag);
				
				// 4. Handle Objects (operator expressions, plain objects, empty objects)
				} else {
					const opValueObj = opValue as Record<string, unknown>;
					const innerKeys = Object.keys(opValueObj);
					
					// 5. Reject Empty Objects (Corrupted Data)
					// Example: { $not: {} } → No operators to negate → Impossible condition
					if (innerKeys.length === 0) {
						fragment = { sql: '1=0', args: [] };
					
					// 6. Handle Nested Logical Operators ($and/$or/$nor)
					// Example: { $not: { $and: [...] } } → Unwrap and negate
					} else if (innerKeys.some(k => k === '$and' || k === '$or' || k === '$nor')) {
						const innerFragment = processSelector(opValueObj as MangoQuerySelector<RxDocumentData<RxDocType>>, schema, logicalDepth + 1);
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
							fragment = wrapWithNot(eqFrag);
						} else {
							// Has operators → Process normally
							// Example: { $not: { $gt: 5 } } → NOT (field > 5)
							const [[innerOp, innerVal]] = Object.entries(opValueObj);
							const innerFrag = translateLeafOperator(innerOp, fieldName, innerVal, schema, actualFieldName);
							fragment = wrapWithNot(innerFrag);
						}
					}
				}
			} else if (op === '$elemMatch') {
				const elemMatchFragment = translateElemMatch(fieldName, opValue as ElemMatchCriteria, schema, actualFieldName);
				if (!elemMatchFragment) return null;
				fragment = elemMatchFragment;
			} else if (!op.startsWith('$')) {
				const jsonPath = `json_extract(${fieldName}, '$.${op}')`;
				const nestedFieldName = `${actualFieldName}.${op}`;
				fragment = translateLeafOperator('$eq', jsonPath, opValue, schema, nestedFieldName);
			} else {
				fragment = translateLeafOperator(op, fieldName, opValue, schema, actualFieldName);
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
		conditions.push(fragment.sql);
		args.push(...fragment.args);
	}
}

	const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
	return { sql: where, args };
}
