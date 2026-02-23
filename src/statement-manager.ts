import type { Database, Statement, Changes } from 'bun:sqlite';

export type QueryWithParams = {
	query: string;
	params: any[];
};

export class StatementManager {
	private db: Database;
	private staticStatements = new Map<string, Statement>();

	constructor(db: Database) {
		this.db = db;
	}

	all(queryWithParams: QueryWithParams): any[] {
		const { query, params } = queryWithParams;

		if (this.isStaticSQL(query)) {
			let stmt = this.staticStatements.get(query);
			if (!stmt) {
				stmt = this.db.query(query);
				this.staticStatements.set(query, stmt);
			}
			return stmt.all(...params);
		} else {
			const stmt = this.db.prepare(query);
			try {
				return stmt.all(...params);
			} finally {
				stmt.finalize();
			}
		}
	}

	run(queryWithParams: QueryWithParams): Changes {
		const { query, params } = queryWithParams;

		if (this.isStaticSQL(query)) {
			let stmt = this.staticStatements.get(query);
			if (!stmt) {
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
