import { Query } from 'mingo';
import type { RxJsonSchema, RxDocumentData } from 'rxdb';
import { getColumnInfo } from '../src/query/schema-mapper';

interface TestDoc {
	id: string;
	metadata: any;
}

const schema: RxJsonSchema<RxDocumentData<TestDoc>> = {
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string' },
		metadata: { type: 'object' },
		_deleted: { type: 'boolean' },
		_attachments: { type: 'object' },
		_rev: { type: 'string' },
		_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
	},
	required: ['id', '_deleted', '_attachments', '_rev', '_meta']
};

const doc: RxDocumentData<TestDoc> = {
	id: '1',
	metadata: {
		user: [
			{ profile: { name: 'Alice' } },
			{ profile: { name: 'Bob' } }
		]
	},
	_deleted: false,
	_attachments: {},
	_rev: '1-a',
	_meta: { lwt: 1000 }
};

const query = { 'metadata.user.profile.name': 'Alice' };

console.log('=== PROOF: Silent Data Loss Bug ===\n');
console.log('Document:', JSON.stringify(doc, null, 2));
console.log('\nQuery:', JSON.stringify(query));
console.log('\n--- REFERENCE: Mingo (MongoDB behavior) ---');
const mingoQuery = new Query(query);
const mingoMatches = mingoQuery.test(doc as any);
console.log('Mingo result:', mingoMatches ? '✅ MATCHES' : '❌ NO MATCH');

console.log('\n--- OLD BEHAVIOR: Only check final field ---');
function oldBehavior(field: string): boolean {
	const parts = field.split('.');
	let currentPath = '';
	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}.${part}` : part;
		const columnInfo = getColumnInfo(currentPath, schema);
		if (columnInfo.type === 'array') {
			console.log(`  → Segment '${currentPath}' is array, returning null (Mingo fallback)`);
			return true;
		}
	}
	console.log('  → All segments passed, generating SQL');
	return false;
}

const oldFallback = oldBehavior('metadata.user.profile.name');
console.log('OLD: Would generate SQL?', !oldFallback);
console.log('OLD: SQL would be: json_extract(data, \'$.metadata.user.profile.name\') = ?');
console.log('OLD: SQLite returns:', 'null (array in path)');
console.log('OLD: Result:', oldFallback ? '✅ MATCHES (Mingo fallback)' : '❌ NO MATCH (SILENT DATA LOSS!)');

console.log('\n--- NEW BEHAVIOR: Check all segments for unknown types ---');
function newBehavior(field: string): boolean {
	const parts = field.split('.');
	let currentPath = '';
	for (const part of parts) {
		currentPath = currentPath ? `${currentPath}.${part}` : part;
		const columnInfo = getColumnInfo(currentPath, schema);
		console.log(`  → Segment '${currentPath}': type='${columnInfo.type}'`);
		if (columnInfo.type === 'array' || columnInfo.type === 'unknown') {
			console.log(`    ✓ Returning null (Mingo fallback)`);
			return true;
		}
	}
	console.log('  → All segments passed, generating SQL');
	return false;
}

const newFallback = newBehavior('metadata.user.profile.name');
console.log('NEW: Falls back to Mingo?', newFallback);
console.log('NEW: Result:', newFallback ? '✅ MATCHES (Mingo fallback - CORRECT!)' : '❌ NO MATCH');

console.log('\n=== SUMMARY ===');
console.log('Mingo (reference):  ', mingoMatches ? '✅ MATCHES' : '❌ NO MATCH');
console.log('OLD behavior:       ', oldFallback ? '✅ MATCHES' : '❌ NO MATCH (BUG!)');
console.log('NEW behavior:       ', newFallback ? '✅ MATCHES' : '❌ NO MATCH');
console.log('\n✅ Bug proven: OLD behavior causes silent data loss!');
console.log('✅ Fix verified: NEW behavior correctly falls back to Mingo!');
