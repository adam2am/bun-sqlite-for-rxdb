import type { RxJsonSchema, RxDocumentData } from 'rxdb';

export interface ColumnInfo {
	column?: string;
	jsonPath?: string;
	type: 'string' | 'number' | 'boolean' | 'unknown';
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
	
	return { jsonPath: `$.${path}`, type: 'unknown' };
}
