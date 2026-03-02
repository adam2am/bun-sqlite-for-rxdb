import type { RxDocumentData, MangoQuerySelector, MangoQueryOperators } from 'rxdb';
import { matchesRegex } from './regex-matcher';

type Operator = (docValue: any, queryValue: any) => boolean;

const operators: Record<string, Operator> = {
	$eq: (a, b) => a === b,
	$ne: (a, b) => a !== b,
	$gt: (a, b) => a > b,
	$gte: (a, b) => a >= b,
	$lt: (a, b) => a < b,
	$lte: (a, b) => a <= b,
	$in: (a, b) => Array.isArray(b) && b.some(v => v === a),
	$nin: (a, b) => Array.isArray(b) && !b.some(v => v === a),
	$exists: (a, b) => (a !== undefined) === b,
	$type: (a, b) => {
		let type: string;
		if (a === null) type = 'null';
		else if (Array.isArray(a)) type = 'array';
		else type = typeof a;

		const matchType = (targetType: string) => {
			switch (targetType) {
				case 'null': return type === 'null';
				case 'boolean':
				case 'bool': return type === 'boolean';
				case 'number':
				case 'int':
				case 'long':
				case 'double':
				case 'decimal': return type === 'number';
				case 'string': return type === 'string';
				case 'array': return type === 'array';
				case 'object': return type === 'object';
				default: return false;
			}
		};

		if (Array.isArray(b)) {
			return b.some(t => matchType(t));
		}
		return matchType(b as string);
	},
	$mod: (a, b) => {
		if (!Array.isArray(b) || b.length !== 2) return false;
		const [divisor, remainder] = b;
		return typeof a === 'number' && a % divisor === remainder;
	},
	$size: (a, b) => Array.isArray(a) && a.length === b,
};

function getNestedValue<T>(obj: T, path: string): unknown {
	const segments = path.split('.');
	let value: unknown = obj;
	
	for (let i = 0; i < segments.length; i++) {
		const field = segments[i];
		const isNumericIndex = /^\d+$/.test(field);
		
		if (Array.isArray(value) && !isNumericIndex) {
			const remainingPath = segments.slice(i).join('.');
			const results: unknown[] = [];
			for (const item of value) {
				const resolved = getNestedValue(item, remainingPath);
				if (resolved !== undefined) {
					if (Array.isArray(resolved)) {
						results.push(...resolved);
					} else {
						results.push(resolved);
					}
				}
			}
			return results.length > 0 ? results : undefined;
		}
		
		value = (value as Record<string, unknown>)?.[field];
		if (value === undefined) return undefined;
	}
	
	return value;
}

function matchesValue(value: unknown, condition: unknown): boolean {
	if (Array.isArray(value)) {
		return value.includes(condition);
	}
	return value === condition;
}

function matchesOperators(value: unknown, conditions: Record<string, unknown>): boolean {
	for (const [op, opValue] of Object.entries(conditions)) {
		if (op === '$regex') {
			const options = (conditions as MangoQueryOperators<unknown, unknown>).$options;
			if (Array.isArray(value)) {
				if (!value.some(v => matchesRegex(v, opValue as string, options))) return false;
			} else {
				if (!matchesRegex(value, opValue as string, options)) return false;
			}
			continue;
		}

		if (op === '$not') {
			if (matchesOperator(value, opValue)) return false;
			continue;
		}

	if (op === '$elemMatch') {
		if (!Array.isArray(value)) return false;
		
		// MongoDB: $elemMatch is scalar condition ONLY if ALL keys are field-level operators
		// If it contains logical operators ($and/$or/$nor) or field names, it's a document query
		const isOperatorObj = typeof opValue === 'object' && opValue !== null && 
			Object.keys(opValue).length > 0 &&
			Object.keys(opValue).every(k => k.startsWith('$') && k !== '$and' && k !== '$or' && k !== '$nor');
		
		const hasMatch = value.some(item => {
			if (isOperatorObj) return matchesOperators(item, opValue as Record<string, unknown>);
			return matchesSelector(item, opValue as MangoQuerySelector<any>);
		});
		
		if (!hasMatch) return false;
		continue;
	}

		if (op === '$options') continue;

	const operatorFn = operators[op];
	if (!operatorFn) return false;
	
	const isStructuralOp = op === '$size' || op === '$type';
	const isNegativeOp = op === '$ne' || op === '$nin';
	
	if (Array.isArray(value) && !isStructuralOp) {
		if (isNegativeOp) {
			if (!value.every(v => operatorFn(v, opValue))) return false;
		} else {
			if (!value.some(v => operatorFn(v, opValue))) return false;
		}
	} else {
		if (!operatorFn(value, opValue)) return false;
	}
	}
	return true;
}

export function matchesSelector<RxDocType>(
	doc: RxDocumentData<RxDocType>,
	selector: MangoQuerySelector<RxDocumentData<RxDocType>>
): boolean {
	if (!selector || typeof selector !== 'object') return true;

	if (selector.$and) {
		if (!Array.isArray(selector.$and) || !selector.$and.every(s => matchesSelector(doc, s))) return false;
	}
	if (selector.$or) {
		if (!Array.isArray(selector.$or) || !selector.$or.some(s => matchesSelector(doc, s))) return false;
	}
	if (selector.$nor) {
		if (!Array.isArray(selector.$nor) || selector.$nor.some(s => matchesSelector(doc, s))) return false;
	}

	for (const [field, condition] of Object.entries(selector)) {
		if (field.startsWith('$')) continue;
		
		const value = getNestedValue(doc, field);
		
		if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
			if (!matchesOperators(value, condition as Record<string, unknown>)) {
				return false;
			}
		} else {
			if (!matchesValue(value, condition)) return false;
		}
	}

	return true;
}

function matchesOperator(value: unknown, operator: unknown | MangoQueryOperators<unknown, unknown>): boolean {
	if (typeof operator !== 'object' || operator === null) {
		return matchesValue(value, operator);
	}

	return matchesOperators(value, operator as Record<string, unknown>);
}
