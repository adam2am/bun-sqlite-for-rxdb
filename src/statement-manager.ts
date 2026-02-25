import type { Database, Statement, Changes, SQLQueryBindings } from 'bun:sqlite';

export type QueryWithParams = {
	query: string;
	params: SQLQueryBindings[];
};

export class StatementManager {
	private db: Database;
	private staticStatements = new Map<string, Statement>();
	private static readonly MAX_STATEMENTS = 500;

	constructor(db: Database) {
		this.db = db;
	}

	private evictOldest(): void {
		if (this.staticStatements.size >= StatementManager.MAX_STATEMENTS) {
			const firstKey = this.staticStatements.keys().next().value;
			if (firstKey) {
				const stmt = this.staticStatements.get(firstKey);
				stmt?.finalize();
				this.staticStatements.delete(firstKey);
			}
		}
	}

	all<T = unknown>(queryWithParams: QueryWithParams): T[] {
		const { query, params } = queryWithParams;
		const stmt = this.db.query(query);
		return stmt.all(...params) as T[];
	}

	get(queryWithParams: QueryWithParams): unknown {
		const { query, params } = queryWithParams;
		const stmt = this.db.query(query);
		return stmt.get(...params);
	}

	run(queryWithParams: QueryWithParams): Changes {
		const { query, params } = queryWithParams;

		if (this.isStaticSQL(query)) {
			let stmt = this.staticStatements.get(query);
			if (stmt) {
				// LRU: Move to end
				this.staticStatements.delete(query);
				this.staticStatements.set(query, stmt);
			} else {
				this.evictOldest();
				stmt = this.db.query(query);
				this.staticStatements.set(query, stmt);
			}
			return stmt.run(...params);
		} else {
			const stmt = this.db.prepare(query);
			try {
				return stmt.run(...params);
			} finally {
				stmt.finalize();
			}
		}
	}

	close(): void {
		for (const stmt of this.staticStatements.values()) {
			stmt.finalize();
		}
		this.staticStatements.clear();
	}

	private isStaticSQL(query: string): boolean {
		if (query.includes('WHERE (')) {
			return false;
		}
		return true;
	}
}
