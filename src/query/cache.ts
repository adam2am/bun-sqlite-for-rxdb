import type { Database } from 'bun:sqlite';
import type { SqlFragment } from './operators';
import { SieveCache } from './sieve-cache';

// Cache capacities - single source of truth
export const MAX_QUERY_CACHE_SIZE = 5000;
export const MAX_REGEX_CACHE_SIZE = 100;
export const MAX_INDEX_CACHE_SIZE = 1000;

// ============================================================================
// Query Cache (SQL translation cache)
// ============================================================================

// Per-database cache (production)
const queryCacheByDatabase = new WeakMap<Database, SieveCache<string, SqlFragment | null>>();

// Global cache (tests only - for buildWhereClause without database)
const GLOBAL_QUERY_CACHE = new SieveCache<string, SqlFragment | null>(MAX_QUERY_CACHE_SIZE);

export function getQueryCache(database: Database): SieveCache<string, SqlFragment | null> {
	let cache = queryCacheByDatabase.get(database);
	if (!cache) {
		cache = new SieveCache(MAX_QUERY_CACHE_SIZE);
		queryCacheByDatabase.set(database, cache);
	}
	return cache;
}

export function getGlobalCache(): SieveCache<string, SqlFragment | null> {
	return GLOBAL_QUERY_CACHE;
}

export function getCacheSize(): number {
	return GLOBAL_QUERY_CACHE.size;
}

export function clearCache(): void {
	GLOBAL_QUERY_CACHE.clear();
}

// ============================================================================
// Regex Cache (regex pattern compilation cache)
// ============================================================================

export interface RegexCacheEntry {
	regex: RegExp;
}

const REGEX_CACHE = new SieveCache<string, RegexCacheEntry>(MAX_REGEX_CACHE_SIZE);

export function getRegexCache(): SieveCache<string, RegexCacheEntry> {
	return REGEX_CACHE;
}

export function clearRegexCache(): void {
	REGEX_CACHE.clear();
}

// ============================================================================
// Index Cache (smart regex index detection cache)
// ============================================================================

const INDEX_CACHE = new SieveCache<string, boolean>(MAX_INDEX_CACHE_SIZE);

export function getIndexCache(): SieveCache<string, boolean> {
	return INDEX_CACHE;
}

export function clearIndexCache(): void {
	INDEX_CACHE.clear();
}
