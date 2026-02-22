import type { RxJsonSchema, MangoQuerySelector, RxDocumentData } from 'rxdb';
import { getColumnInfo } from './schema-mapper';
import { translateEq, translateNe, translateGt, translateGte, translateLt, translateLte } from './operators';
import type { SqlFragment } from './operators';

export function buildWhereClause<RxDocType>(
	selector: MangoQuerySelector<RxDocumentData<RxDocType>>,
	schema: RxJsonSchema<RxDocumentData<RxDocType>>
): SqlFragment {
	const conditions: string[] = [];
	const args: (string | number | boolean | null)[] = [];
	
	for (const [field, value] of Object.entries(selector)) {
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
