export function hasKnownMingoBug(query: any): boolean {
	const checkValue = (val: any, isTopLevel = false, fieldName?: string): boolean => {
		if (typeof val === 'bigint') return true;
		if (val instanceof RegExp) return true;
		if (Array.isArray(val)) return val.some(v => checkValue(v, false));
		if (val && typeof val === 'object' && !Array.isArray(val)) {
			if (val.$in && Array.isArray(val.$in) && val.$in.some((v: any) => v instanceof RegExp)) return true;
			if (val.$nin && Array.isArray(val.$nin) && val.$nin.some((v: any) => v instanceof RegExp)) return true;
			if (val.$mod && Array.isArray(val.$mod)) return true;

			const keys = Object.keys(val);
			if (isTopLevel) {
				if (keys.some(k => ['$text', '$where', '$expr', '$jsonSchema', '$comment'].includes(k))) return true;

				if (keys.includes('$not')) return true;

				for (const key of keys) {
					if (!key.startsWith('$')) {
						const fieldVal = val[key];
						if (key === 'matrix' && fieldVal && typeof fieldVal === 'object') {
							if (fieldVal.$gt !== undefined || fieldVal.$gte !== undefined ||
								fieldVal.$lt !== undefined || fieldVal.$lte !== undefined ||
								fieldVal.$all !== undefined || fieldVal.$in !== undefined) {
								return true;
							}
						}

						if (fieldVal && typeof fieldVal === 'object' && !Array.isArray(fieldVal) && !(fieldVal instanceof RegExp)) {
							const fieldKeys = Object.keys(fieldVal);
							if (fieldKeys.length > 0 && !fieldKeys[0].startsWith('$')) {
								return true;
							}
						}
						if (Array.isArray(fieldVal) && fieldVal.length === 0 && key.includes('.')) {
							return true;
						}
					}
					if (checkValue(val[key], false, key)) return true;
				}
			} else {
				return Object.values(val).some(v => checkValue(v, false));
			}
		}
		return false;
	};
	return checkValue(query, true);
}
