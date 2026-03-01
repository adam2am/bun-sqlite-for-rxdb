import type { RxJsonSchema, RxDocumentData } from 'rxdb';

export interface ColumnInfo {
	column?: string;
	jsonPath?: string;
	type: 'string' | 'number' | 'boolean' | 'array' | 'unknown';
}

export function getColumnInfo<RxDocType>(path: string, schema: RxJsonSchema<RxDocumentData<RxDocType>>): ColumnInfo {
	if (path === '_deleted') {
		return { column: 'deleted', type: 'boolean' };
	}
	
	if (path === '_meta.lwt') {
		return { column: 'mtime_ms', type: 'number' };
	}
	
	if (path === '_rev') {
		return { column: 'rev', type: 'string' };
	}
	
	if (path === schema.primaryKey) {
		return { column: 'id', type: 'string' };
	}
	
	const properties = schema.properties as Record<string, { type?: string; items?: unknown } | undefined>;
	const fieldSchema = properties?.[path];
	if (fieldSchema && typeof fieldSchema === 'object' && 'type' in fieldSchema) {
		const schemaType = fieldSchema.type;
		if (schemaType === 'array') {
			return { jsonPath: `$.${path}`, type: 'array' };
		}
		if (schemaType === 'string') {
			return { jsonPath: `$.${path}`, type: 'string' };
		}
		if (schemaType === 'number') {
			return { jsonPath: `$.${path}`, type: 'number' };
		}
		if (schemaType === 'boolean') {
			return { jsonPath: `$.${path}`, type: 'boolean' };
		}
	}
	
	return { jsonPath: `$.${path}`, type: 'unknown' };
}
