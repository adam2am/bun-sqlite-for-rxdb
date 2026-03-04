import type { RxDocumentData } from 'rxdb';

export interface TestDocType {
	id: string;
	name: string;
	age: number;
	tags: string[];
	active: boolean;
	score: number;
	scores?: number[];
	optional?: string;
	metadata?: Record<string, any>;
	unknownField?: any;
	items: Array<{
		name: string;
		category: string;
		price: number;
		tags: string[];
	}>;
	'first name'?: string;
	'user-name'?: string;
	role?: string;
	matrix?: number[][];
	data?: any;
	count?: any;
	strVal?: string;
}

export const mockDocs: RxDocumentData<TestDocType>[] = [
	{ id: '1', name: 'Alice', age: 30, tags: ['admin', 'user'], active: true, score: 95.5, scores: [85, 90, 92], optional: 'present', 'first name': 'Alice', role: 'admin', items: [{ name: 'item1', category: 'A', price: 100, tags: ['new'] }, { name: 'item2', category: 'B', price: 200, tags: ['sale'] }], _deleted: false, _attachments: {}, _rev: '1-a', _meta: { lwt: 1000 } },
	{ id: '2', name: 'Bob', age: 25, tags: ['user'], active: false, score: 80.0, scores: [80, 88], 'user-name': 'bob123', role: 'user', count: 1, items: [{ name: 'item3', category: 'A', price: 150, tags: [] }], _deleted: false, _attachments: {}, _rev: '1-b', _meta: { lwt: 2000 } },
	{ id: '3', name: 'Charlie', age: 35, tags: ['admin', 'moderator'], active: true, score: 88.3, scores: [75, 81, 95], optional: 'value', matrix: [[1, 2], [3, 4]], items: [{ name: 'item4', category: 'C', price: 300, tags: ['premium', 'new'] }], _deleted: false, _attachments: {}, _rev: '1-c', _meta: { lwt: 3000 } },
	{ id: '4', name: 'Café', age: 28, tags: ['user', 'moderator'], active: true, score: 92.1, scores: [91, 93], matrix: [[5, 6], [7, 8]], items: [], _deleted: false, _attachments: {}, _rev: '1-d', _meta: { lwt: 4000 } },
	{ id: '5', name: 'Eve', age: 22, tags: [], active: false, score: 75.0, scores: [70, 75, 80], optional: undefined, matrix: [[1, 2], [3, 10]], count: "1", items: [{ name: 'item5', category: 'B', price: 50, tags: ['clearance'] }], _deleted: false, _attachments: {}, _rev: '1-e', _meta: { lwt: 5000 } },
	{ id: '6', name: 'Frank', age: 40, tags: ['test'], active: true, score: 50, scores: [50, 55], metadata: { '0': 'value0', '1': 'value1' }, unknownField: ['item1', 'item2'], data: "admin", items: [], _deleted: false, _attachments: {}, _rev: '1-f', _meta: { lwt: 6000 } },
	{ id: '7', name: 'Grace', age: 45, tags: ['test'], active: false, score: 60, scores: [60, 65], metadata: { b: 2, a: 1 }, unknownField: 'item1', data: 15, items: [], _deleted: false, _attachments: {}, _rev: '1-g', _meta: { lwt: 7000 } },
	{ id: '8', name: 'Hank', age: 50, tags: [], active: true, score: 10, scores: [10, 15], optional: null as any, items: [], _deleted: false, _attachments: {}, _rev: '1-h', _meta: { lwt: 8000 } },
	{ id: '9', name: 'Ivy', age: 33, tags: [], active: true, score: 70, scores: [70, 72], metadata: {}, items: [], _deleted: false, _attachments: {}, _rev: '1-i', _meta: { lwt: 9000 } },
	{ id: '10', name: 'user1', age: 27, tags: [], active: true, score: 85, items: [], _deleted: false, _attachments: {}, _rev: '1-j', _meta: { lwt: 10000 } },
	{ id: '11', name: 'user2', age: 29, tags: [], active: false, score: 90, items: [], _deleted: false, _attachments: {}, _rev: '1-k', _meta: { lwt: 11000 } },
	{ id: '12', name: 'Overflow', age: -9223372036854775808, tags: [], active: true, score: -9223372036854775808, items: [], _deleted: false, _attachments: {}, _rev: '1-l', _meta: { lwt: 12000 } },
	{ id: '13', name: 'MultiLine', age: 30, tags: [], active: true, score: 85, items: [], strVal: "Line1\nLine2", _deleted: false, _attachments: {}, _rev: '1-m', _meta: { lwt: 13000 } },
	{ id: '14', name: '50%', age: 30, tags: [], active: true, score: 85, items: [], strVal: "50%", _deleted: false, _attachments: {}, _rev: '1-n', _meta: { lwt: 14000 } },
	{ id: '15', name: 'test_', age: 30, tags: [], active: true, score: 85, items: [], strVal: "test_", _deleted: false, _attachments: {}, _rev: '1-o', _meta: { lwt: 15000 } },
	{ id: '16', name: 'user_name', age: 30, tags: [], active: true, score: 85, items: [], _deleted: false, _attachments: {}, _rev: '1-p', _meta: { lwt: 16000 } },
];
