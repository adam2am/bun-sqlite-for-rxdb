import type { RxDocumentData, MangoQuerySelector, MangoQueryOperators, MangoQueryRegexOptions } from 'rxdb';
import { matchesRegex } from './regex-matcher';
import { stableStringify } from '../utils/stable-stringify';

type MatcherFn<T = unknown> = (doc: T, selector: MangoQuerySelector<T>) => boolean;
type OperatorFn = (value: unknown, arg: unknown, matcher: MatcherFn) => boolean;

function isOperatorObject(obj: unknown): obj is Record<string, unknown> {
	if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
	const keys = Object.keys(obj);
	if (keys.length === 0) return false;
	return keys.every(k => k.startsWith('$'));
}

function isSameBsonType(a: unknown, b: unknown): boolean {
	if (a === null || b === null) return a === b;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	
	if (b instanceof Date && typeof a === 'string') {
		return !isNaN(Date.parse(a));
	}
	if (a instanceof Date && typeof b === 'string') {
		return !isNaN(Date.parse(b));
	}
	
	return typeof a === typeof b;
}

function getNestedValue(obj: unknown, path: string): unknown {
	const segments = path.split('.');
	let value: unknown = obj;
	
	for (let i = 0; i < segments.length; i++) {
		const field = segments[i];
		if (Array.isArray(value) && !/^\d+$/.test(field)) {
			const remainingPath = segments.slice(i).join('.');
			const results: unknown[] = [];
			for (const item of value) {
				const res = getNestedValue(item, remainingPath);
				if (res !== undefined) {
					if (Array.isArray(res)) {
						results.push(...res);
					} else {
						results.push(res);
					}
				}
			}
			return results.length > 0 ? results : undefined;
		}
		
		if (value && typeof value === 'object') {
			value = (value as Record<string, unknown>)[field];
		} else {
			return undefined;
		}
		if (value === undefined) return undefined;
	}
	return value;
}

const operators: Record<string, OperatorFn> = {
	$eq: (a, b) => {
		if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
			if (Array.isArray(a) && Array.isArray(b)) {
				return stableStringify(a) === stableStringify(b);
			}
			return JSON.stringify(a) === JSON.stringify(b);
		}
		return a === b;
	},
	$ne: (a, b) => {
		if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
			return stableStringify(a) !== stableStringify(b);
		}
		return a !== b;
	},
	$gt: (a, b) => {
		if (Array.isArray(a) || Array.isArray(b)) return false;
		if (typeof a === 'object' || typeof b === 'object') return false;
		if (a === null || a === undefined || b === null || b === undefined) return false;
		return isSameBsonType(a, b) && a > b;
	},
	$gte: (a, b) => {
		if (Array.isArray(a) || Array.isArray(b)) return false;
		if (typeof a === 'object' || typeof b === 'object') return false;
		if (a === null || a === undefined || b === null || b === undefined) return false;
		return isSameBsonType(a, b) && a >= b;
	},
	$lt: (a, b) => {
		if (Array.isArray(a) || Array.isArray(b)) return false;
		if (typeof a === 'object' || typeof b === 'object') return false;
		if (a === null || a === undefined || b === null || b === undefined) return false;
		return isSameBsonType(a, b) && a < b;
	},
	$lte: (a, b) => {
		if (Array.isArray(a) || Array.isArray(b)) return false;
		if (typeof a === 'object' || typeof b === 'object') return false;
		if (a === null || a === undefined || b === null || b === undefined) return false;
		return isSameBsonType(a, b) && a <= b;
	},
	$in: (a, b) => {
		if (!Array.isArray(b)) return false;
		const aStr = (typeof a === 'object' && a !== null) ? stableStringify(a) : undefined;
		return b.some(v => {
			if (v instanceof RegExp) {
				return matchesRegex(a, v.source, v.flags);
			}
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
			if (v instanceof RegExp) {
				return matchesRegex(a, v.source, v.flags);
			}
			if (aStr !== undefined && typeof v === 'object' && v !== null) {
				return aStr === stableStringify(v);
			}
			return v === a;
		});
	},
	$exists: (a, b) => (a !== undefined) === b,
	$mod: (a, b) => {
		if (!Array.isArray(b) || b.length !== 2) return false;
		if (typeof a !== 'number') return false;
		const [divisor, remainder] = b;
		if (typeof divisor !== 'number' || typeof remainder !== 'number') return false;
		return a % divisor === remainder;
	},
	$size: (a, b) => Array.isArray(a) && a.length === b,
	$regex: (a, b) => {
		if (typeof b === 'string') {
			return matchesRegex(a, b, undefined);
		}
		if (typeof b === 'object' && b !== null && 'pattern' in b) {
			const regexObj = b as { pattern: string; options?: string };
			return matchesRegex(a, regexObj.pattern, regexObj.options);
		}
		return false;
	},
	$type: (a, b) => {
		const bsonTypeMap: Record<string, string> = {
			'1': 'number', '2': 'string', '3': 'object', '4': 'array',
			'8': 'boolean', '9': 'date', '10': 'null', '11': 'regex', '16': 'number', '18': 'number', '19': 'number'
		};

		const getType = (val: unknown): string => {
			if (val === null) return 'null';
			if (Array.isArray(val)) return 'array';
			if (val instanceof Date) return 'date';
			if (val instanceof RegExp) return 'regex';
			return typeof val;
		};

		const matchType = (val: unknown, t: string | number): boolean => {
			const valType = getType(val);
			const typeStr = bsonTypeMap[String(t)] || String(t);
			if (typeStr === 'int' || typeStr === 'long' || typeStr === 'decimal' || typeStr === 'double') return valType === 'number';
			if (typeStr === 'bool') return valType === 'boolean';
			if (typeStr === 'date') return valType === 'date';
			if (typeStr === 'regex') return valType === 'regex';
			return valType === typeStr;
		};

		const types = Array.isArray(b) ? b : [b];
		const checkingForArray = types.some(t => {
			const typeStr = bsonTypeMap[String(t)] || String(t);
			return typeStr === 'array';
		});

		if (Array.isArray(a) && !checkingForArray) {
			return a.some(item => types.some(t => matchType(item, t)));
		}
		
		return types.some(t => matchType(a, t));
	},
	$not: (a, b, matcher) => {
		if (b instanceof RegExp) {
			return !matchesRegex(a, b.source, b.flags);
		}
		if (isOperatorObject(b)) {
			return !matchesOperators(a, b, matcher);
		}
		return operators.$ne(a, b, matcher);
	},
	$elemMatch: (val, query, matcher) => {
		if (!Array.isArray(val)) return false;
		if (typeof query !== 'object' || query === null) return false;
		
		const hasLogicalOps = ['$and', '$or', '$nor'].some(k => k in query);
		const isOpObj = isOperatorObject(query) && !hasLogicalOps;

		return val.some(item => {
			if (isOpObj) return matchesOperators(item, query, matcher);
			return matcher(item, query as MangoQuerySelector<unknown>);
		});
	},
	$all: (a, b, matcher) => {
		if (!Array.isArray(b)) return false;
		if (!Array.isArray(a)) return false;
		return b.every(req => {
			if (typeof req === 'object' && req !== null && !Array.isArray(req) && !(req instanceof Date) && !(req instanceof RegExp)) {
				const reqObj = req as Record<string, unknown>;
				if ('$elemMatch' in reqObj) {
					return operators.$elemMatch(a, reqObj.$elemMatch, matcher);
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

function matchesOperators(value: unknown, condition: Record<string, unknown>, matcher: MatcherFn): boolean {
	for (const [op, arg] of Object.entries(condition)) {
		if (op === '$options') continue;
		
		const fn = operators[op];
		if (!fn) {
			return false;
		}
		
		let operatorArg = arg;
		if (op === '$regex' && typeof arg === 'string' && '$options' in condition) {
			operatorArg = { pattern: arg, options: condition.$options as string };
		}

		const isNegative = op === '$ne' || op === '$nin';
		const isStructural = op === '$size' || op === '$type' || op === '$elemMatch' || op === '$all' || op === '$exists';
		const argIsArrayOrObject = typeof arg === 'object' && arg !== null;
		const skipTraversal = argIsArrayOrObject && (op === '$eq' || op === '$ne');
		
		if (Array.isArray(value) && !isStructural && !skipTraversal) {
			const predicate = (v: unknown) => fn(v, operatorArg, matcher);
			if (isNegative ? !value.every(predicate) : !value.some(predicate)) return false;
		} else {
			if (!fn(value, operatorArg, matcher)) return false;
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
			if (conditionUnknown instanceof Date) {
				const eq = operators.$eq;
				if (Array.isArray(value)) {
					if (!value.some(v => eq(v, condition, matchesSelector as MatcherFn))) return false;
				} else {
					if (!eq(value, condition, matchesSelector as MatcherFn)) return false;
				}
			} else if (conditionUnknown instanceof RegExp) {
				if (Array.isArray(value)) {
					if (!value.some(v => matchesRegex(v, conditionUnknown.source, conditionUnknown.flags))) return false;
				} else {
					if (!matchesRegex(value, conditionUnknown.source, conditionUnknown.flags)) return false;
				}
			} else if (isOperatorObject(condition)) {
				if (!matchesOperators(value, condition, matchesSelector as MatcherFn)) return false;
			} else {
				const eq = operators.$eq;
				if (Array.isArray(value)) {
					if (!value.some(v => eq(v, condition, matchesSelector as MatcherFn))) return false;
				} else {
					if (!eq(value, condition, matchesSelector as MatcherFn)) return false;
				}
			}
		} else {
			const eq = operators.$eq;
			if (Array.isArray(value)) {
				const flattenAndCheck = (arr: unknown[], cond: unknown): boolean => {
					for (const item of arr) {
						if (Array.isArray(item) && !Array.isArray(cond) && typeof cond !== 'object') {
							if (flattenAndCheck(item, cond)) return true;
						} else {
							if (eq(item, cond, matchesSelector as MatcherFn)) return true;
						}
					}
					return false;
				};
				if (!flattenAndCheck(value, condition)) return false;
			} else {
				if (!eq(value, condition, matchesSelector as MatcherFn)) return false;
			}
		}
	}
	return true;
}
