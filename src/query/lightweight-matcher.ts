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
		const type = Array.isArray(a) ? 'array' : typeof a;
		return type === b;
	},
	$mod: (a, b) => {
		if (!Array.isArray(b) || b.length !== 2) return false;
		const [divisor, remainder] = b;
		return typeof a === 'number' && a % divisor === remainder;
	},
	$size: (a, b) => Array.isArray(a) && a.length === b,
};

function getNestedValue(obj: any, path: string): any {
	return path.split('.').reduce((current, key) => current?.[key], obj);
}

export function matchesSelector(doc: any, selector: any): boolean {
	if (!selector || typeof selector !== 'object') return true;

	// Handle logical operators first
	if (selector.$and) {
		return Array.isArray(selector.$and) && selector.$and.every((s: any) => matchesSelector(doc, s));
	}
	if (selector.$or) {
		return Array.isArray(selector.$or) && selector.$or.some((s: any) => matchesSelector(doc, s));
	}
	if (selector.$nor) {
		return Array.isArray(selector.$nor) && !selector.$nor.some((s: any) => matchesSelector(doc, s));
	}

	// Handle field operators
	for (const [field, condition] of Object.entries(selector)) {
		const value = getNestedValue(doc, field);

		// Direct equality (no operator)
		if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
			if (value !== condition) return false;
			continue;
		}

		// Handle operators
		for (const [op, opValue] of Object.entries(condition)) {
			if (op === '$regex') {
				const options = (condition as any).$options;
				if (!matchesRegex(value, opValue as string, options)) return false;
				continue;
			}

			if (op === '$not') {
				if (matchesOperator(value, opValue)) return false;
				continue;
			}

			if (op === '$elemMatch') {
				if (!Array.isArray(value)) return false;
				const hasMatch = value.some(item => matchesSelector(item, opValue));
				if (!hasMatch) return false;
				continue;
			}

			if (op === '$options') continue; // Skip $options (handled with $regex)

			const operator = operators[op];
			if (!operator) return false; // Unknown operator
			if (!operator(value, opValue)) return false;
		}
	}

	return true;
}

function matchesOperator(value: any, operator: any): boolean {
	if (typeof operator !== 'object' || operator === null) {
		return value === operator;
	}

	for (const [op, opValue] of Object.entries(operator)) {
		if (op === '$regex') {
			const options = (operator as any).$options;
			return matchesRegex(value, opValue as string, options);
		}

		const operatorFn = operators[op];
		if (!operatorFn) return false;
		if (operatorFn(value, opValue)) return true;
	}

	return false;
}
