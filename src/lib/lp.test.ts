import { describe, expect, it } from 'vitest';
import { solveLP } from './lp';

describe('solveLP', () => {
	it('solves a maximisation problem and reports all variable values', () => {
		// max 2x + 3y  s.t.  x + 2y <= 8, 3x + y <= 9, x,y >= 0
		// Optimum at (x, y) = (2, 3) with objective 13.
		const result = solveLP({
			opType: 'max',
			objective: { x: 2, y: 3 },
			constraints: {
				c0: { max: 8 },
				c1: { max: 9 }
			},
			variables: {
				x: { c0: 1, c1: 3 },
				y: { c0: 2, c1: 1 }
			}
		});

		expect(result.feasible).toBe(true);
		expect(result.objective).toBeCloseTo(13, 8);
		expect(result.values.x).toBeCloseTo(2, 8);
		expect(result.values.y).toBeCloseTo(3, 8);
	});

	it('solves a minimisation problem with a >= constraint', () => {
		// min x + y  s.t.  x + y >= 3, x,y >= 0  →  objective 3
		const result = solveLP({
			opType: 'min',
			objective: { x: 1, y: 1 },
			constraints: { c0: { min: 3 } },
			variables: {
				x: { c0: 1 },
				y: { c0: 1 }
			}
		});

		expect(result.feasible).toBe(true);
		expect(result.objective).toBeCloseTo(3, 8);
		expect(result.values.x + result.values.y).toBeCloseTo(3, 8);
	});

	it('respects equality constraints', () => {
		// max x  s.t.  x = 5  →  5
		const result = solveLP({
			opType: 'max',
			objective: { x: 1 },
			constraints: { c0: { equal: 5 } },
			variables: { x: { c0: 1 } }
		});

		expect(result.feasible).toBe(true);
		expect(result.objective).toBeCloseTo(5, 8);
		expect(result.values.x).toBeCloseTo(5, 8);
	});

	it('reports infeasible models as not feasible', () => {
		// x <= 2 and x >= 5 cannot hold simultaneously.
		const result = solveLP({
			opType: 'max',
			objective: { x: 1 },
			constraints: {
				lo: { max: 2 },
				hi: { min: 5 }
			},
			variables: { x: { lo: 1, hi: 1 } }
		});

		expect(result.feasible).toBe(false);
	});

	it('merges the objective into each variable and keeps other coefficients intact', () => {
		// A variable that does not appear in any constraint must not be
		// dropped, and must default to 0 when the solver ignores it.
		const result = solveLP({
			opType: 'max',
			objective: { x: 1, y: 0 },
			constraints: { c0: { max: 4 } },
			variables: {
				x: { c0: 1 },
				y: {}
			}
		});

		expect(result.feasible).toBe(true);
		expect(result.objective).toBeCloseTo(4, 8);
		expect(result.values.x).toBeCloseTo(4, 8);
		expect(result.values.y).toBe(0);
	});
});
