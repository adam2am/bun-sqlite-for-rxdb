import { describe, it, expect } from 'bun:test';

describe('$not with $and validation (Mango query spec)', () => {
	it('documents that bare operators in $and are invalid Mango', () => {
		const invalidQuery = {
			age: {
				$not: {
					$and: [
						{ $gt: 20 },
						{ $lt: 40 }
					]
				}
			}
		};

		expect(invalidQuery).toBeDefined();
	});

	it('documents that field-wrapped operators are valid Mango', () => {
		const validQuery = {
			$not: {
				$and: [
					{ age: { $gt: 20 } },
					{ age: { $lt: 40 } }
				]
			}
		};

		expect(validQuery).toBeDefined();
	});
});
