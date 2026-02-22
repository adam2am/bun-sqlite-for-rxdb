import type { RxJsonSchema, MangoQuerySelector, RxDocumentData } from 'rxdb';
import { getColumnInfo } from './schema-mapper';
import { translateEq, translateNe, translateGt, translateGte, translateLt, translateLte, translateIn, translateNin, translateExists, translateRegex } from './operators';
import type { SqlFragment } from './operators';

export function buildWhereClause<RxDocType>(
	selector: MangoQuerySelector<RxDocumentData<RxDocType>>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>
): SqlFragment {
	return processSelector(selector, schema, 0);
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
			const orFragments = value.map(subSelector => processSelector(subSelector, schema, logicalDepth + 1));
			const orConditions = orFragments.map(f => f.sql);
			const needsParens = logicalDepth > 0 && orConditions.length > 1;
			const joined = orConditions.join(' OR ');
			conditions.push(needsParens ? `(${joined})` : joined);
			orFragments.forEach(f => args.push(...f.args));
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
