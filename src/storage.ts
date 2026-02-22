import type { RxStorage, RxStorageInstanceCreationParams } from 'rxdb';
import type { BunSQLiteStorageSettings } from './types';
import { BunSQLiteStorageInstance } from './instance';

export function getRxStorageBunSQLite(
	settings: BunSQLiteStorageSettings = {}
): RxStorage<any, any> {
	return {
		name: 'bun-sqlite',
		rxdbVersion: '16.21.1',
		
		async createStorageInstance<RxDocType>(
			params: RxStorageInstanceCreationParams<RxDocType, any>
		) {
			return new BunSQLiteStorageInstance(params, settings);
		}
	};
}
