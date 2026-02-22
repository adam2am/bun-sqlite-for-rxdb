import type { RxTestStorage } from 'rxdb';
import { getRxStorageBunSQLite } from '../src/storage';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';

export const BUN_SQLITE_TEST_STORAGE: RxTestStorage = {
	name: 'bun-sqlite',
	
	async init() {},
	
	getStorage() {
		return wrappedValidateAjvStorage({
			storage: getRxStorageBunSQLite({})
		});
	},
	
	getPerformanceStorage() {
		return {
			description: 'bun-sqlite-native-jsonb',
			storage: getRxStorageBunSQLite({})
		};
	},
	
	hasPersistence: true,
	hasMultiInstance: true,
	hasAttachments: false,
	hasReplication: true
};
