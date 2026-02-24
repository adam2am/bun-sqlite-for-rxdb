export interface SqlFragment {
	sql: string;
	args: (string | number | boolean)[];
}

export function smartRegexToLike(field: string, pattern: string, options?: string): SqlFragment | null {
	const caseInsensitive = options?.includes('i');
	
	if (caseInsensitive) {
		return null;
	}
	
	const startsWithAnchor = pattern.startsWith('^');
	const endsWithAnchor = pattern.endsWith('$');
	
	let cleanPattern = pattern.replace(/^\^/, '').replace(/\$$/, '');
	
	if (startsWithAnchor && endsWithAnchor && !/[*+?()[\]{}|]/.test(cleanPattern)) {
		const exact = cleanPattern.replace(/\\\./g, '.');
		if (caseInsensitive) {
			const escaped = exact.replace(/%/g, '\\%').replace(/_/g, '\\_');
			return { sql: `${field} LIKE ? COLLATE NOCASE ESCAPE '\\'`, args: [escaped] };
		}
		return { sql: `${field} = ?`, args: [exact] };
	}
	
	if (startsWithAnchor) {
		const prefix = cleanPattern.replace(/\\\./g, '.');
		if (!/[*+?()[\]{}|]/.test(prefix)) {
			const escaped = prefix.replace(/%/g, '\\%').replace(/_/g, '\\_');
			return caseInsensitive
				? { sql: `${field} LIKE ? COLLATE NOCASE ESCAPE '\\'`, args: [escaped + '%'] }
				: { sql: `${field} LIKE ? ESCAPE '\\'`, args: [escaped + '%'] };
		}
	}
	
	if (endsWithAnchor) {
		const suffix = cleanPattern.replace(/\\\./g, '.');
		if (!/[*+?()[\]{}|]/.test(suffix)) {
			const escaped = suffix.replace(/%/g, '\\%').replace(/_/g, '\\_');
			return caseInsensitive
				? { sql: `${field} LIKE ? COLLATE NOCASE ESCAPE '\\'`, args: ['%' + escaped] }
				: { sql: `${field} LIKE ? ESCAPE '\\'`, args: ['%' + escaped] };
		}
	}
	
	cleanPattern = cleanPattern.replace(/\\\./g, '.');
	if (!/[*+?()[\]{}|^$]/.test(cleanPattern)) {
		const escaped = cleanPattern.replace(/%/g, '\\%').replace(/_/g, '\\_');
		return caseInsensitive
			? { sql: `${field} LIKE ? COLLATE NOCASE ESCAPE '\\'`, args: ['%' + escaped + '%'] }
			: { sql: `${field} LIKE ? ESCAPE '\\'`, args: ['%' + escaped + '%'] };
	}
	
	return null;
}
