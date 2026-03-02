/**
 * Adds MongoDB-compatible type guards to enforce strict BSON type boundaries.
 * Prevents SQLite's implicit type conversion from breaking query correctness.
 * 
 * @param field - SQL field expression (e.g., "json_extract(data, '$.age')" or "value")
 * @param value - Query value to compare against (determines expected type)
 * @param comparisonSql - SQL comparison expression (e.g., "field > ?")
 * @returns SQL with type guard prepended, or original SQL if guard not needed
 */
export function addTypeGuard(field: string, value: unknown, comparisonSql: string): string {
	let typeExpr = '';
	
	if (field === 'value') {
		typeExpr = 'type';
	} else if (field.includes('json_extract')) {
		const match = field.match(/json_extract\(([^,]+),\s*'([^']+)'\)/);
		if (match) {
			const [, jsonColumn, jsonPath] = match;
			typeExpr = `json_type(${jsonColumn}, '${jsonPath}')`;
		}
	}
	
	if (!typeExpr) return comparisonSql;
	
	const valueType = typeof value;
	if (valueType === 'number') {
		return `(${typeExpr} IN ('integer', 'real') AND ${comparisonSql})`;
	}
	if (valueType === 'string') {
		return `(${typeExpr} = 'text' AND ${comparisonSql})`;
	}
	if (valueType === 'boolean') {
		return `(${typeExpr} IN ('true', 'false') AND ${comparisonSql})`;
	}
	return comparisonSql;
}
