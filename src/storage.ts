import type { RxStorage, RxStorageInstanceCreationParams } from 'rxdb';
import { addRxStorageMultiInstanceSupport } from 'rxdb';
import type { BunSQLiteStorageSettings, BunSQLiteInternals } from './types';
import { BunSQLiteStorageInstance } from './instance';

export function getRxStorageBunSQLite(
	settings: BunSQLiteStorageSettings = {}
): RxStorage<BunSQLiteInternals, BunSQLiteStorageSettings> {
	return {
		name: 'bun-sqlite',
		rxdbVersion: '16.21.1',
		
		async createStorageInstance<RxDocType>(
			params: RxStorageInstanceCreationParams<RxDocType, BunSQLiteStorageSettings>
		) {
			const instance = new BunSQLiteStorageInstance(params, settings);
			addRxStorageMultiInstanceSupport('bun-sqlite', params, instance);
			return instance;
		}
	};
}
