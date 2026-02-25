import type { RxJsonSchema, RxDocumentData } from 'rxdb';

export const mockSchema: RxJsonSchema<RxDocumentData<any>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		name: { type: 'string' },
		age: { type: 'number' },
		tags: { type: 'array', items: { type: 'string' } },
		metadata: { type: 'object' }
	},
	required: ['id']
};
