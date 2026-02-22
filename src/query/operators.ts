export interface SqlFragment {
	sql: string;
	args: (string | number | boolean | null)[];
}

export function translateEq(field: string, value: unknown): SqlFragment {
	if (value === null) {
		return { sql: `${field} IS NULL`, args: [] };
	}
	return { sql: `${field} = ?`, args: [value as string | number | boolean] };
}

export function translateNe(field: string, value: unknown): SqlFragment {
	if (value === null) {
		return { sql: `${field} IS NOT NULL`, args: [] };
	}
	return { sql: `${field} <> ?`, args: [value as string | number | boolean] };
}

export function translateGt(field: string, value: unknown): SqlFragment {
	return { sql: `${field} > ?`, args: [value as string | number] };
}

export function translateGte(field: string, value: unknown): SqlFragment {
	return { sql: `${field} >= ?`, args: [value as string | number] };
}

export function translateLt(field: string, value: unknown): SqlFragment {
	return { sql: `${field} < ?`, args: [value as string | number] };
}

export function translateLte(field: string, value: unknown): SqlFragment {
	return { sql: `${field} <= ?`, args: [value as string | number] };
}
