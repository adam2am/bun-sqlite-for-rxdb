import { describe, it, expect } from 'bun:test';
import { getRxStorageBunSQLite } from '$app/storage';
import { runSQLQuery, runMingoQuery, compareResults } from '$tests/property-based/engine/runner';

describe('ISOLATED: Exact $in failure from JSON (01--name-in-str-.json)', () => {
	it('should reproduce the exact failure with real data', async () => {
		const storage = getRxStorageBunSQLite({ strict: true });
		const instance = await storage.createStorageInstance({
			databaseInstanceToken: 'isolated-in-exact',
			databaseName: 'testdb',
			collectionName: 'users',
			schema: {
				version: 0,
				primaryKey: 'id',
				type: 'object',
				properties: {
					id: { type: 'string', maxLength: 100 },
					name: { type: 'string' },
					age: { type: 'number' },
					tags: { type: 'array', items: { type: 'string' } },
					active: { type: 'boolean' },
					score: { type: 'number' },
					scores: { type: 'array', items: { type: 'number' } },
					optional: { type: 'string' },
					metadata: { type: 'object' },
					unknownField: {},
					'first name': { type: 'string' },
					'user-name': { type: 'string' },
					role: { type: 'string' },
					matrix: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
					data: {},
					count: {},
					strVal: { type: 'string' },
					items: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: 'string' },
								category: { type: 'string' },
								price: { type: 'number' },
								tags: { type: 'array', items: { type: 'string' } }
							}
						}
					},
					_deleted: { type: 'boolean' },
					_attachments: { type: 'object' },
					_rev: { type: 'string' },
					_meta: { type: 'object', properties: { lwt: { type: 'number' } } }
				},
				required: ['id', '_deleted', '_attachments', '_rev', '_meta']
			},
			options: {},
			multiInstance: false,
			devMode: false
		});

		const docs = [
			{"id":"08306085-7c11-800d-ab46-965ecb7c71b5","name":"Alice","age":0,"active":true,"count":888,"score":3.3176563427936236e-187,"scores":null,"optional":"value","tags":[],"items":[{"name":"NVs-$i","category":"C","price":165,"tags":[]}],"first name":"Alice","user-name":"alice456","role":"user","matrix":null,"data":"user","unknownField":null,"strVal":"Line1\nLine2","metadata":{"0":"value0","1":"value1"},"_deleted":false,"_attachments":{},"_rev":"*'C'","_meta":{"lwt":402057174675}},
			{"id":"14b1c1bb-5c09-3fc4-a5ed-17d375a2b9e2","name":"Café","age":0,"active":false,"count":"1","score":-9223372036854776000,"scores":[41,38,95],"optional":"present","tags":[],"items":[{"name":"*","category":"C","price":841,"tags":["clearance","premium"]},{"name":"]uxA","category":"B","price":931,"tags":[]}],"first name":"Bob","user-name":"alice456","role":"user","matrix":[[1,4],[5,7]],"data":"admin","unknownField":["item1","item2"],"strVal":"Line1\nLine2","metadata":{"a":1,"b":2},"_deleted":false,"_attachments":{},"_rev":"","_meta":{"lwt":820656807903}},
			{"id":"bc277d51-0410-3265-b0c9-33092bd5781c","name":"Charlie","age":null,"active":false,"count":"1","score":7.296421355952219e-124,"scores":[71,92],"optional":"present","tags":[],"items":[{"name":"-hR|C","category":"B","price":56,"tags":[]}],"first name":null,"user-name":"alice456","role":"moderator","matrix":[[4,9],[5,10]],"data":90,"unknownField":"item1","strVal":"50%","metadata":{"0":"value0","1":"value1"},"_deleted":false,"_attachments":{},"_rev":"bby~I2S","_meta":{"lwt":1764274017131}},
			{"id":"3def95f5-0568-2c7f-a605-b4de480c5611","name":"RHTEGjG`I0gK","age":0,"active":true,"count":"1","score":-9223372036854776000,"scores":[18,13],"optional":"value","tags":[],"items":[{"name":"AHR:]g:","category":"A","price":58,"tags":[]},{"name":"^31Dt&Q22","category":"A","price":831,"tags":[]}],"first name":"Bob","user-name":"alice456","role":null,"matrix":[[6,1],[10,7]],"data":81,"unknownField":null,"strVal":null,"metadata":{},"_deleted":false,"_attachments":{},"_rev":"&","_meta":{"lwt":529315281437}},
			{"id":"5ca583d0-0da9-13c0-a026-67b48d0899b4","name":"%/33!@Lp0","age":null,"active":true,"count":"1","score":-9223372036854776000,"scores":[76,70,48],"optional":"value","tags":["user","admin"],"items":[{"name":"37:e{","category":"A","price":198,"tags":["sale"]}],"first name":"Alice","user-name":"alice456","role":"admin","matrix":[[10,5],[1,3]],"data":26,"unknownField":"item2","strVal":null,"metadata":{"0":"value0","1":"value1"},"_deleted":false,"_attachments":{},"_rev":"RN(OK","_meta":{"lwt":588517824311}},
			{"id":"d74afed7-3a61-62ca-8764-d8d58770cf2b","name":"Alice","age":70,"active":true,"count":"1","score":-9223372036854776000,"scores":[56,95,47],"optional":null,"tags":["admin"],"items":[{"name":"z.T/J'YO_","category":"C","price":754,"tags":["sale","new"]},{"name":"3MJO.]7r|","category":"B","price":907,"tags":["new","clearance"]}],"first name":"Alice","user-name":"bob123","role":"admin","matrix":[[7,8],[7,8]],"data":61,"unknownField":"item1","strVal":"test_","metadata":{"a":1,"b":2},"_deleted":false,"_attachments":{},"_rev":"9GQ<#]dw`*","_meta":{"lwt":1214073615912}},
			{"id":"1696d105-f0c0-1539-97e7-4f2f676ccb5f","name":"user_name","age":0,"active":true,"count":781,"score":5.519170739967691e-24,"scores":[59,3],"optional":"value","tags":["admin","test"],"items":[],"first name":"Alice","user-name":"bob123","role":null,"matrix":[[7,1],[1,6]],"data":null,"unknownField":"item2","strVal":null,"metadata":{},"_deleted":false,"_attachments":{},"_rev":"","_meta":{"lwt":600504163608}},
			{"id":"11dc1dde-1700-1996-b7b1-fe91c72f952b","name":"50%","age":14,"active":false,"count":"1","score":6.0846351683891455e-254,"scores":[93,96,67],"optional":"present","tags":["admin","admin","user"],"items":[{"name":"9OM","category":"C","price":4,"tags":[]}],"first name":"Alice","user-name":"bob123","role":"moderator","matrix":null,"data":"user","unknownField":null,"strVal":"50%","metadata":null,"_deleted":false,"_attachments":{},"_rev":"-N&&x\\A~/o","_meta":{"lwt":1615241870998}},
			{"id":"b06d1f24-1594-7835-9cfe-66f2d0ae165d","name":"Bob","age":0,"active":true,"count":184,"score":-9223372036854776000,"scores":[52,21],"optional":"present","tags":[],"items":[{"name":"E<Or","category":"B","price":193,"tags":[]}],"first name":"Bob","user-name":"alice456","role":"moderator","matrix":[[2,4],[6,7]],"data":"admin","unknownField":["item2","item1"],"strVal":null,"metadata":{"0":"value0","1":"value1"},"_deleted":false,"_attachments":{},"_rev":"yWMIxH","_meta":{"lwt":632630735317}},
			{"id":"c3550ecb-cf5d-4f72-acc7-1951a58cfe20","name":"Alice","age":0,"active":false,"count":548,"score":1.8198400960828787e-206,"scores":[83,78,39],"optional":"present","tags":["moderator"],"items":[],"first name":"Bob","user-name":"bob123","role":"admin","matrix":[[3,6],[0,6]],"data":8,"unknownField":["item2"],"strVal":"test_","metadata":{"a":1,"b":2},"_deleted":false,"_attachments":{},"_rev":"h%^","_meta":{"lwt":1136010022877}},
			{"id":"ab9c6ad9-46f2-6c6d-94cd-8c3eb62d4f9b","name":"Bob","age":null,"active":true,"count":"1","score":-9223372036854776000,"scores":[46,47,64],"optional":"present","tags":["admin","user"],"items":[{"name":"gNP3!Gs","category":"A","price":386,"tags":[]}],"first name":"Bob","user-name":null,"role":null,"matrix":[[4,6],[9,1]],"data":25,"unknownField":"item1","strVal":"50%","metadata":{"a":1,"b":2},"_deleted":false,"_attachments":{},"_rev":"","_meta":{"lwt":1673561404944}},
			{"id":"9509fb43-bfff-4b34-983a-bb9aef90a0a3","name":"user_name","age":13,"active":false,"count":605,"score":-9223372036854776000,"scores":[68,30,17],"optional":null,"tags":["admin","user"],"items":[],"first name":"Alice","user-name":null,"role":"user","matrix":[[1,1],[1,6]],"data":"admin","unknownField":["item2","item1"],"strVal":"test_","metadata":{"a":1,"b":2},"_deleted":false,"_attachments":{},"_rev":"","_meta":{"lwt":1712539879928}},
			{"id":"728de6b0-9671-23c5-8a93-9bd6ad15cdb7","name":"Charlie","age":null,"active":true,"count":320,"score":32,"scores":[99,80],"optional":"value","tags":["admin","user"],"items":[{"name":"j","category":"A","price":914,"tags":[]}],"first name":"Bob","user-name":"alice456","role":"admin","matrix":[[2,6],[4,4]],"data":"admin","unknownField":null,"strVal":"Line1\nLine2","metadata":{"a":1,"b":2},"_deleted":false,"_attachments":{},"_rev":"sV>/F","_meta":{"lwt":9453407691}},
			{"id":"57654d8d-a87e-59a3-8cfd-a1b052b281a6","name":"Alice","age":null,"active":false,"count":106,"score":4.0638871386437236e-266,"scores":[47,6],"optional":null,"tags":["admin","user"],"items":[],"first name":"Bob","user-name":"bob123","role":"moderator","matrix":[[1,1],[5,2]],"data":"admin","unknownField":"item1","strVal":"Line1\nLine2","metadata":{"a":1,"b":2},"_deleted":false,"_attachments":{},"_rev":"^v%\\K%< U","_meta":{"lwt":1599675978958}}
		];

		await instance.bulkWrite(docs.map(doc => ({ document: doc as any })), 'test');

		const query = { name: { $in: ['Bob', 'Alice', 'Alice'] } };
		const sqlResult = await runSQLQuery(instance, query);
		const mingoResult = runMingoQuery(docs, query);

		console.log(`\n${'='.repeat(80)}`);
		console.log(`Query: ${JSON.stringify(query)}`);
		console.log(`Expected (Mingo): [${mingoResult.ids.sort().join(', ')}] (${mingoResult.ids.length} docs)`);
		console.log(`SQL returned:     [${sqlResult.ids.sort().join(', ')}] (${sqlResult.ids.length} docs)`);
		console.log('='.repeat(80));

		if (sqlResult.ids.length !== mingoResult.ids.length) {
			console.log(`\n❌ COUNT MISMATCH: SQL returned ${sqlResult.ids.length} docs, Mingo returned ${mingoResult.ids.length} docs`);
			const sqlOnly = sqlResult.ids.filter(id => !mingoResult.ids.includes(id));
			const mingoOnly = mingoResult.ids.filter(id => !sqlResult.ids.includes(id));
			if (sqlOnly.length > 0) {
				console.log(`\nSQL matched but Mingo didn't (${sqlOnly.length} docs):`);
				sqlOnly.forEach(id => {
					const doc = docs.find(d => d.id === id);
					console.log(`  - ${id}: name="${doc?.name}"`);
				});
			}
			if (mingoOnly.length > 0) {
				console.log(`\nMingo matched but SQL didn't (${mingoOnly.length} docs):`);
				mingoOnly.forEach(id => {
					const doc = docs.find(d => d.id === id);
					console.log(`  - ${id}: name="${doc?.name}"`);
				});
			}
		}

		await instance.remove();

		const comparison = compareResults(sqlResult, mingoResult);
		expect(comparison.match).toBe(true);
	}, 30000);
});
