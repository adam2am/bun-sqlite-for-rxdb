import type { RxStorageInstance, MangoQuerySelector, RxDocumentData } from 'rxdb';
import { Query } from 'mingo';

export interface QueryResult<T> {
	ids: string[];
	count: number;
}

export async function runSQLQuery<T extends { id: string }>(
	instance: RxStorageInstance<T, unknown, unknown>,
	selector: unknown
): Promise<QueryResult<T>> {
	type QueryType = Parameters<typeof instance.query>[0];
	
	const result = await instance.query({
		query: {
			selector: selector as unknown as MangoQuerySelector<RxDocumentData<T>>,
			sort: [{ id: 'asc' }] as QueryType['query']['sort'],
			skip: 0
		},
		queryPlan: {
			index: ['id'],
			sortSatisfiedByIndex: false,
			selectorSatisfiedByIndex: false,
			startKeys: [],
			endKeys: [],
			inclusiveStart: true,
			inclusiveEnd: true
		}
	});

	return {
		ids: result.documents.map(doc => doc.id).sort(),
		count: result.documents.length
	};
}

export function runMingoQuery<T extends { id: string }>(
	docs: T[],
	selector: unknown
): QueryResult<T> {
	const mingoQuery = new Query<T>(selector as ConstructorParameters<typeof Query<T>>[0]);
	const results = mingoQuery.find<T>(docs).all();

	return {
		ids: results.map(doc => doc.id).sort(),
		count: results.length
	};
}

export function compareResults<T>(
	sqlResult: QueryResult<T>,
	mingoResult: QueryResult<T>
): { match: boolean; diff?: { sql: string[]; mingo: string[] } } {
	const match = JSON.stringify(sqlResult.ids) === JSON.stringify(mingoResult.ids);

	if (!match) {
		return {
			match: false,
			diff: {
				sql: sqlResult.ids,
				mingo: mingoResult.ids
			}
		};
	}

	return { match: true };
}
