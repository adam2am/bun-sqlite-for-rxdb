/**
 * Operator Registry - Single Source of Truth for MongoDB Query Operators
 * 
 * Separates top-level operators (query structure) from field-level operators (value constraints).
 * This separation prevents the "unsupported operator trap" where unknown operators are treated as field names.
 * 
 * Architecture:
 * - Top-level operators: Control query structure ($and, $or, $nor, $not)
 * - Field-level operators: Apply constraints to field values ($eq, $gt, $regex, etc.)
 * 
 * Design Principles:
 * 1. Single Source of Truth: All supported operators defined in one place
 * 2. Explicit Validation: Unknown operators return null → trigger Mingo fallback
 * 3. Type Safety: Clear separation prevents mixing operator scopes
 * 4. Maintainability: Adding new operators requires updating only this file
 */

/**
 * Top-level operators that control query structure.
 * These appear at the root of a query selector.
 * 
 * Examples:
 * - { $and: [{ age: 30 }, { active: true }] }
 * - { $or: [{ name: 'Alice' }, { name: 'Bob' }] }
 * - { $not: { age: { $gt: 25 } } }
 */
export const TOP_LEVEL_OPERATORS = new Set([
	'$and',
	'$or',
	'$nor',
	'$not'
]);

/**
 * Field-level operators that apply constraints to field values.
 * These appear inside field expressions.
 * 
 * Examples:
 * - { age: { $gt: 25 } }
 * - { name: { $regex: '^A' } }
 * - { tags: { $elemMatch: { $eq: 'admin' } } }
 */
export const FIELD_LEVEL_OPERATORS = new Set([
	'$eq',
	'$ne',
	'$gt',
	'$gte',
	'$lt',
	'$lte',
	'$in',
	'$nin',
	'$all',
	'$elemMatch',
	'$size',
	'$exists',
	'$type',
	'$regex',
	'$mod'
]);

/**
 * Checks if a key is a supported top-level operator.
 * 
 * @param key - The key to check (e.g., '$and', '$text', 'age')
 * @returns true if the key is a supported top-level operator
 * 
 * @example
 * isTopLevelOperator('$and')  // true
 * isTopLevelOperator('$text') // false (unsupported)
 * isTopLevelOperator('age')   // false (field name)
 */
export function isTopLevelOperator(key: string): boolean {
	return TOP_LEVEL_OPERATORS.has(key);
}

/**
 * Checks if a key is a supported field-level operator.
 * 
 * @param key - The key to check (e.g., '$eq', '$bitsAllSet', 'name')
 * @returns true if the key is a supported field-level operator
 * 
 * @example
 * isFieldLevelOperator('$eq')         // true
 * isFieldLevelOperator('$bitsAllSet') // false (unsupported)
 * isFieldLevelOperator('name')        // false (field name)
 */
export function isFieldLevelOperator(key: string): boolean {
	return FIELD_LEVEL_OPERATORS.has(key);
}
