import type { RxJsonSchema, RxDocumentData } from 'rxdb';

export interface ColumnInfo {
	column?: string;
	jsonPath?: string;
	type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown';
}

interface SchemaField {
	type?: string;
	properties?: Record<string, SchemaField>;
	items?: SchemaField;
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
	
	const parts = path.split('.');
	let current: Record<string, SchemaField> | undefined = schema.properties as Record<string, SchemaField>;
	let schemaType: string | undefined;
	let lastField: SchemaField | undefined;
	
	if (process.env.DEBUG_SCHEMA_MAPPER) {
		console.log(`[getColumnInfo] path="${path}", parts:`, parts);
	}
	
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		const field: SchemaField | undefined = current?.[part];
		if (!field) {
			if (process.env.DEBUG_SCHEMA_MAPPER) {
				console.log(`[getColumnInfo] part="${part}" not found in current, returning unknown`);
			}
			return { jsonPath: `$.${path}`, type: 'unknown' };
		}
		schemaType = field.type;
		lastField = field;
		
		if (process.env.DEBUG_SCHEMA_MAPPER) {
			console.log(`[getColumnInfo] part="${part}" (${i+1}/${parts.length}), schemaType="${schemaType}", hasProperties:`, !!field.properties, 'hasItems:', !!field.items);
		}
		
		if (i === parts.length - 1) {
			break;
		}
		
		if (field.properties) {
			current = field.properties;
		} else if (field.items?.properties) {
			current = field.items.properties;
		} else {
			if (process.env.DEBUG_SCHEMA_MAPPER) {
				console.log(`[getColumnInfo] cannot continue traversing, returning unknown`);
			}
			return { jsonPath: `$.${path}`, type: 'unknown' };
		}
	}
	
	if (schemaType === 'array') {
		if (process.env.DEBUG_SCHEMA_MAPPER) {
			console.log(`[getColumnInfo] returning array for path="${path}"`);
		}
		return { jsonPath: `$.${path}`, type: 'array' };
	}
	if (schemaType === 'object') {
		if (lastField?.properties && Object.keys(lastField.properties).length > 0) {
			if (process.env.DEBUG_SCHEMA_MAPPER) {
				console.log(`[getColumnInfo] returning object for path="${path}" (has properties)`);
			}
			return { jsonPath: `$.${path}`, type: 'object' };
		}
		if (process.env.DEBUG_SCHEMA_MAPPER) {
			console.log(`[getColumnInfo] returning unknown for path="${path}" (vague object)`);
		}
		return { jsonPath: `$.${path}`, type: 'unknown' };
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
	
	if (process.env.DEBUG_SCHEMA_MAPPER) {
		console.log(`[getColumnInfo] returning unknown for path="${path}", schemaType="${schemaType}"`);
	}
	return { jsonPath: `$.${path}`, type: 'unknown' };
}
