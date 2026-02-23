import type { RxJsonSchema, MangoQuerySelector, RxDocumentData } from 'rxdb';
import { getColumnInfo } from './schema-mapper';
import { translateEq, translateNe, translateGt, translateGte, translateLt, translateLte, translateIn, translateNin, translateExists, translateRegex, translateElemMatch, translateNot, translateType, translateSize, translateMod } from './operators';
import type { SqlFragment } from './operators';
import stringify from 'fast-stable-stringify';

const QUERY_CACHE = new Map<string, SqlFragment>();
const MAX_CACHE_SIZE = 500;

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
): SqlFragment {
	const cacheKey = `v${schema.version}_${collectionName}_${stringify(selector)}`;
	
	const cached = QUERY_CACHE.get(cacheKey);
	if (cached) {
		QUERY_CACHE.delete(cacheKey);
		QUERY_CACHE.set(cacheKey, cached);
		return cached;
	}
	
	const result = processSelector(selector, schema, 0);
	
	if (QUERY_CACHE.size >= MAX_CACHE_SIZE) {
		const firstKey = QUERY_CACHE.keys().next().value;
		if (firstKey) QUERY_CACHE.delete(firstKey);
	}
	
	QUERY_CACHE.set(cacheKey, result);
	return result;
}

function buildLogicalOperator<RxDocType>(
	operator: 'or' | 'nor',
	conditions: MangoQuerySelector<RxDocumentData<RxDocType>>[],
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	logicalDepth: number
): SqlFragment {
	if (conditions.length === 0) {
		return { sql: '1=1', args: [] };
	}
	
	const fragments = conditions.map(subSelector => processSelector(subSelector, schema, logicalDepth + 1));
	const sql = fragments.map(f => f.sql).join(' OR ');
	const args = fragments.flatMap(f => f.args);
	
	return operator === 'nor' 
		? { sql: `NOT(${sql})`, args }
		: { sql, args };
}

function processSelector<RxDocType>(
	selector: MangoQuerySelector<RxDocumentData<RxDocType>>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>,
	logicalDepth: number
): SqlFragment {
	const conditions: string[] = [];
	const args: (string | number | boolean | null)[] = [];
	
	for (const [field, value] of Object.entries(selector)) {
		if (field === '$and' && Array.isArray(value)) {
			const andFragments = value.map(subSelector => processSelector(subSelector, schema, logicalDepth));
			const andConditions = andFragments.map(f => f.sql);
			const needsParens = logicalDepth > 0 && andConditions.length > 1;
			const joined = andConditions.join(' AND ');
			conditions.push(needsParens ? `(${joined})` : joined);
			andFragments.forEach(f => args.push(...f.args));
			continue;
		}

		if (field === '$or' && Array.isArray(value)) {
			const orFragment = buildLogicalOperator('or', value, schema, logicalDepth);
			const needsParens = logicalDepth > 0;
			conditions.push(needsParens ? `(${orFragment.sql})` : orFragment.sql);
			args.push(...orFragment.args);
			continue;
		}

		if (field === '$nor' && Array.isArray(value)) {
			const norFragment = buildLogicalOperator('nor', value, schema, logicalDepth);
			conditions.push(norFragment.sql);
			args.push(...norFragment.args);
			continue;
		}

		const columnInfo = getColumnInfo(field, schema);
		const fieldName = columnInfo.column || `json_extract(data, '${columnInfo.jsonPath}')`;
		
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			for (const [op, opValue] of Object.entries(value)) {
				let fragment: SqlFragment;
				
				switch (op) {
					case '$eq':
						fragment = translateEq(fieldName, opValue);
						break;
					case '$ne':
						fragment = translateNe(fieldName, opValue);
						break;
					case '$gt':
						fragment = translateGt(fieldName, opValue);
						break;
					case '$gte':
						fragment = translateGte(fieldName, opValue);
						break;
					case '$lt':
						fragment = translateLt(fieldName, opValue);
						break;
					case '$lte':
						fragment = translateLte(fieldName, opValue);
						break;
					case '$in':
						fragment = translateIn(fieldName, opValue as unknown[]);
						break;
					case '$nin':
						fragment = translateNin(fieldName, opValue as unknown[]);
						break;
					case '$exists':
						fragment = translateExists(fieldName, opValue as boolean);
						break;
					case '$regex':
						const options = (value as Record<string, unknown>).$options as string | undefined;
						const regexFragment = translateRegex(fieldName, opValue as string, options);
						if (!regexFragment) continue;
						fragment = regexFragment;
						break;
					case '$elemMatch':
						const elemMatchFragment = translateElemMatch(fieldName, opValue);
						if (!elemMatchFragment) continue;
						fragment = elemMatchFragment;
						break;
					case '$not':
						fragment = translateNot(fieldName, opValue);
						break;
					case '$type':
						const typeFragment = translateType(fieldName, opValue as string);
						if (!typeFragment) continue;
						fragment = typeFragment;
						break;
					case '$size':
						fragment = translateSize(fieldName, opValue as number);
						break;
					case '$mod':
						fragment = translateMod(fieldName, opValue as [number, number]);
						break;
					default:
						continue;
				}
				
				conditions.push(fragment.sql);
				args.push(...fragment.args);
			}
		} else {
			const fragment = translateEq(fieldName, value);
			conditions.push(fragment.sql);
			args.push(...fragment.args);
		}
	}
	
	const where = conditions.length > 0 ? conditions.join(' AND ') : '1=1';
	return { sql: where, args };
}
