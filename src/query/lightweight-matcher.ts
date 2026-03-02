import type { RxDocumentData, MangoQuerySelector, MangoQueryOperators, MangoQueryRegexOptions } from 'rxdb';
import { matchesRegex } from './regex-matcher';
import { stableStringify } from '../utils/stable-stringify';

type MatcherFn = (doc: any, selector: MangoQuerySelector<any>) => boolean;
type OperatorFn = (value: any, arg: any, matcher: MatcherFn) => boolean;

function isOperatorObject(obj: any): boolean {
	if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
	const keys = Object.keys(obj);
	if (keys.length === 0) return false;
	return keys.every(k => k.startsWith('$'));
}

function isSameBsonType(a: any, b: any): boolean {
	if (a === null || b === null) return a === b;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	return typeof a === typeof b;
}

function getNestedValue(obj: any, path: string): any {
	const segments = path.split('.');
	let value: any = obj;
	
	for (let i = 0; i < segments.length; i++) {
		const field = segments[i];
		if (Array.isArray(value) && !/^\d+$/.test(field)) {
			const remainingPath = segments.slice(i).join('.');
			const results: any[] = [];
			for (const item of value) {
				const res = getNestedValue(item, remainingPath);
				if (res !== undefined) {
					if (Array.isArray(res)) results.push(...res);
					else results.push(res);
				}
			}
			return results.length > 0 ? results : undefined;
		}
		
		value = value?.[field];
		if (value === undefined) return undefined;
	}
	return value;
}

const operators: Record<string, OperatorFn> = {
	$eq: (a, b) => {
		if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
			return stableStringify(a) === stableStringify(b);
		}
		return a === b;
	},
	$ne: (a, b) => {
		if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
			return stableStringify(a) !== stableStringify(b);
		}
		return a !== b;
	},
	$gt: (a, b) => isSameBsonType(a, b) && a > b,
	$gte: (a, b) => isSameBsonType(a, b) && a >= b,
	$lt: (a, b) => isSameBsonType(a, b) && a < b,
	$lte: (a, b) => isSameBsonType(a, b) && a <= b,
	$in: (a, b) => {
		if (!Array.isArray(b)) return false;
		const aStr = (typeof a === 'object' && a !== null) ? stableStringify(a) : undefined;
		return b.some(v => {
			if (aStr !== undefined && typeof v === 'object' && v !== null) {
				return aStr === stableStringify(v);
			}
			return v === a;
		});
	},
	$nin: (a, b) => {
		if (!Array.isArray(b)) return false;
		const aStr = (typeof a === 'object' && a !== null) ? stableStringify(a) : undefined;
		return !b.some(v => {
			if (aStr !== undefined && typeof v === 'object' && v !== null) {
				return aStr === stableStringify(v);
			}
			return v === a;
		});
	},
	$exists: (a, b) => (a !== undefined) === b,
	$mod: (a, b) => Array.isArray(b) && b.length === 2 && typeof a === 'number' && a % b[0] === b[1],
	$size: (a, b) => Array.isArray(a) && a.length === b,
	$regex: (a, b: string | { pattern: string; options?: MangoQueryRegexOptions }) => {
		const pattern = typeof b === 'string' ? b : b.pattern;
		const flags = typeof b === 'string' ? undefined : b.options;
		return matchesRegex(a, pattern, flags);
	},
	$type: (a, b) => {
		let type: string;
		if (a === null) type = 'null';
		else if (Array.isArray(a)) type = 'array';
		else type = typeof a;

		const matchType = (t: string) => {
			if (t === 'int' || t === 'long' || t === 'decimal' || t === 'double') return type === 'number';
			if (t === 'bool') return type === 'boolean';
			return type === t;
		};

		return Array.isArray(b) ? b.some(matchType) : matchType(b as string);
	},
	$not: (a, b, matcher) => {
		if (isOperatorObject(b)) {
			return !matchesOperators(a, b, matcher);
		}
		return operators.$ne(a, b, matcher);
	},
	$elemMatch: (val, query, matcher) => {
		if (!Array.isArray(val)) return false;
		
		const isOpObj = isOperatorObject(query) && !['$and', '$or', '$nor'].some(k => k in query);

		return val.some(item => {
			if (isOpObj) return matchesOperators(item, query, matcher);
			return matcher(item, query);
		});
	},
	$all: (a, b, matcher) => {
		if (!Array.isArray(b)) return false;
		if (!Array.isArray(a)) return false;
		return b.every(req => {
			if (typeof req === 'object' && req !== null && !Array.isArray(req) && !(req instanceof Date) && !(req instanceof RegExp)) {
				if (req.$elemMatch) {
					return operators.$elemMatch(a, req.$elemMatch, matcher);
				}
			}
			if (req instanceof RegExp) {
				return a.some(item => matchesRegex(item, req.source, req.flags));
			}
			
			const reqStr = typeof req === 'object' && req !== null ? stableStringify(req) : undefined;
			return a.some(item => {
				if (reqStr !== undefined && typeof item === 'object' && item !== null) {
					return reqStr === stableStringify(item);
				}
				return item === req;
			});
		});
	}
};

function matchesOperators(value: any, condition: Record<string, any>, matcher: MatcherFn): boolean {
	for (const [op, arg] of Object.entries(condition)) {
		if (op === '$options') continue;
		
		const fn = operators[op];
		if (fn) {
			let operatorArg = arg;
			if (op === '$regex' && typeof arg === 'string' && condition.$options) {
				operatorArg = { pattern: arg, options: condition.$options };
			}

		const isNegative = op === '$ne' || op === '$nin';
		const isStructural = op === '$size' || op === '$type' || op === '$elemMatch' || op === '$all' || op === '$exists';
		const argIsArrayOrObject = typeof arg === 'object' && arg !== null;
		const skipTraversal = argIsArrayOrObject && (op === '$eq' || op === '$ne');
		
		if (Array.isArray(value) && !isStructural && !skipTraversal) {
				const predicate = (v: any) => fn(v, operatorArg, matcher);
				if (isNegative ? !value.every(predicate) : !value.some(predicate)) return false;
			} else {
				if (!fn(value, operatorArg, matcher)) return false;
			}
		}
	}
	return true;
}

export function matchesSelector<RxDocType>(
	doc: RxDocumentData<RxDocType>,
	selector: MangoQuerySelector<RxDocumentData<RxDocType>>
): boolean {
	if (!selector || typeof selector !== 'object') return true;

	if (Array.isArray(selector.$and) && !selector.$and.every(s => matchesSelector(doc, s))) return false;
	if (Array.isArray(selector.$or) && !selector.$or.some(s => matchesSelector(doc, s))) return false;
	if (Array.isArray(selector.$nor) && selector.$nor.some(s => matchesSelector(doc, s))) return false;

	for (const [field, condition] of Object.entries(selector)) {
		if (field.startsWith('$')) continue;
		
		const value = getNestedValue(doc, field);
		
		if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
			const conditionUnknown = condition as unknown;
			if (conditionUnknown instanceof Date || conditionUnknown instanceof RegExp) {
				const eq = operators.$eq;
				if (Array.isArray(value)) {
					if (!value.some(v => eq(v, condition, matchesSelector))) return false;
				} else {
					if (!eq(value, condition, matchesSelector)) return false;
				}
			} else if (isOperatorObject(condition)) {
				if (!matchesOperators(value, condition, matchesSelector)) return false;
			} else {
				const eq = operators.$eq;
				if (Array.isArray(value)) {
					if (!value.some(v => eq(v, condition, matchesSelector))) return false;
				} else {
					if (!eq(value, condition, matchesSelector)) return false;
				}
			}
		} else {
			const eq = operators.$eq;
			if (Array.isArray(value)) {
				if (!value.some(v => eq(v, condition, matchesSelector))) return false;
			} else {
				if (!eq(value, condition, matchesSelector)) return false;
			}
		}
	}
	return true;
}
