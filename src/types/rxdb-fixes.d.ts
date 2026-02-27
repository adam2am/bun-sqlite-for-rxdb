/**
 * Type fixes for RxDB's incorrect type definitions
 * 
 * RxDB v15.x has incorrect types for some MongoDB operators.
 * This file augments RxDB's types to match MongoDB's official specification.
 * 
 * References:
 * - MongoDB $mod spec: https://www.mongodb.com/docs/manual/reference/operator/query/mod/
 * - RxDB bug: src/types/rx-query.d.ts:56 defines $mod as `number` (wrong)
 * - Should be: [divisor, remainder] tuple
 */

import 'rxdb';

declare module 'rxdb' {
	interface MangoQueryOperators<PathValueType, T> {
		/**
		 * Performs a modulo operation on the value of a field and selects documents
		 * with a specified result.
		 * 
		 * @example
		 * { qty: { $mod: [4, 0] } } // qty % 4 === 0
		 * { qty: { $mod: [4, 1] } } // qty % 4 === 1
		 */
		$mod?: [number, number]; // [divisor, remainder]
	}
}
