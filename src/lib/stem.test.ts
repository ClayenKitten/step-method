import { describe, expect, it } from 'vitest';
import {
	buildPayoff,
	evaluate,
	makeConcession,
	satisfactionPercent,
	solveIteration,
	type Concession,
	type Problem,
	type StemIteration
} from './stem';

const TOL = 1e-6;

/**
 * Reference problem with two maximisation objectives.
 *
 *   max z1 = 2x1 + 3x2
 *   max z2 = 4x1 + x2
 *   s.t.  x1 + 2x2 <= 8
 *         3x1 + x2 <= 9
 *         x1, x2 >= 0
 *
 * Hand-verified values:
 *  - z1 is optimised at (2, 3) with z1 = 13 and z2 = 11.
 *  - z2 is optimised at (3, 0) with z2 = 12 and z1 = 6.
 *  - Payoff table: [[13, 6], [11, 12]]; ideal [13, 12]; worst [6, 11].
 *  - alpha = [7/13, 1/12], total = 97/156, so weights = [84/97, 13/97].
 *  - First min-max step: both deviation constraints bind on the edge
 *    3x1 + x2 = 9 at x = (1215/601, 1764/601) with lambda = 7644/58297.
 */
const maxMaxProblem: Problem = {
	numVars: 2,
	objectives: [
		{ name: 'z1', sense: 'max', coeffs: [2, 3] },
		{ name: 'z2', sense: 'max', coeffs: [4, 1] }
	],
	constraints: [
		{ coeffs: [1, 2], sense: '<=', rhs: 8 },
		{ coeffs: [3, 1], sense: '<=', rhs: 9 }
	]
};

/**
 * Reference problem mixing one max and one min objective.
 *
 *   max z1 = x1 + 2x2
 *   min z2 = x1 - x2
 *   s.t.  x1 <= 3, x2 <= 3, x1 + x2 <= 4, x1, x2 >= 0
 *
 * Hand-verified values:
 *  - z1 is optimised uniquely at (1, 3) with z1 = 7 and z2 = -2.
 *  - z2 is optimised uniquely at (0, 3) with z2 = -3 and z1 = 6.
 *  - Payoff table: [[7, 6], [-2, -3]].
 *  - Correct ideal: [7, -3] (row MIN for the min objective); worst: [6, -2].
 *  - Correct weights: alpha = [1/7, 1/3] → w = [3/10, 7/10].
 *  - idealInternal = [7, 3] (both converted to the maximise convention).
 */
const mixedProblem: Problem = {
	numVars: 2,
	objectives: [
		{ name: 'z1', sense: 'max', coeffs: [1, 2] },
		{ name: 'z2', sense: 'min', coeffs: [1, -1] }
	],
	constraints: [
		{ coeffs: [1, 0], sense: '<=', rhs: 3 },
		{ coeffs: [0, 1], sense: '<=', rhs: 3 },
		{ coeffs: [1, 1], sense: '<=', rhs: 4 }
	]
};

/** Weighted deviation of objective i at x from its ideal (maximise convention). */
function deviation(
	problem: Problem,
	idealInternal: number,
	weight: number,
	x: number[],
	i: number
): number {
	const s = problem.objectives[i].sense === 'max' ? 1 : -1;
	return weight * (idealInternal - s * evaluate(problem.objectives[i], x));
}

describe('evaluate', () => {
	it('computes the dot product of coefficients and the decision vector', () => {
		expect(evaluate({ name: 'z', sense: 'max', coeffs: [2, 3] }, [4, 5])).toBe(23);
	});

	it('treats missing coordinates as zero', () => {
		expect(evaluate({ name: 'z', sense: 'max', coeffs: [2, 3, 7] }, [4, 5])).toBe(23);
	});
});

describe('buildPayoff (max/max problem)', () => {
	const payoff = buildPayoff(maxMaxProblem);

	it('optimises each objective individually and stores the decision vectors', () => {
		expect(payoff.solutions[0][0]).toBeCloseTo(2, 6);
		expect(payoff.solutions[0][1]).toBeCloseTo(3, 6);
		expect(payoff.solutions[1][0]).toBeCloseTo(3, 6);
		expect(payoff.solutions[1][1]).toBeCloseTo(0, 6);
	});

	it('builds the payoff table: table[i][j] = objective i at the optimum of j', () => {
		expect(payoff.table[0][0]).toBeCloseTo(13, 6);
		expect(payoff.table[0][1]).toBeCloseTo(6, 6);
		expect(payoff.table[1][0]).toBeCloseTo(11, 6);
		expect(payoff.table[1][1]).toBeCloseTo(12, 6);
	});

	it('derives the ideal and worst values of every objective', () => {
		expect(payoff.ideal[0]).toBeCloseTo(13, 6);
		expect(payoff.ideal[1]).toBeCloseTo(12, 6);
		expect(payoff.worst[0]).toBeCloseTo(6, 6);
		expect(payoff.worst[1]).toBeCloseTo(11, 6);
	});

	it('computes normalised relative-spread weights', () => {
		expect(payoff.weights[0]).toBeCloseTo(84 / 97, 8);
		expect(payoff.weights[1]).toBeCloseTo(13 / 97, 8);
		expect(payoff.weights[0] + payoff.weights[1]).toBeCloseTo(1, 12);
	});

	it('stores ideal values in the internal maximise convention', () => {
		expect(payoff.idealInternal[0]).toBeCloseTo(13, 6);
		expect(payoff.idealInternal[1]).toBeCloseTo(12, 6);
	});
});

describe('buildPayoff (max/min problem)', () => {
	const payoff = buildPayoff(mixedProblem);

	it('stores ideal values in the internal maximise convention', () => {
		// max(-z2) = -min(z2) = 3 — this anchor is used by the min-max step.
		expect(payoff.idealInternal[0]).toBeCloseTo(7, 6);
		expect(payoff.idealInternal[1]).toBeCloseTo(3, 6);
	});

	// Regression tests for a former bug (src/lib/stem.ts): ideal/worst used to
	// be taken as the row max/min unconditionally, which is backwards for
	// minimisation objectives and also corrupted the weight normalisation.
	it('takes the ideal of a min objective as the row minimum', () => {
		expect(payoff.ideal[0]).toBeCloseTo(7, 6);
		expect(payoff.ideal[1]).toBeCloseTo(-3, 6);
	});

	it('takes the worst value of a min objective as the row maximum', () => {
		expect(payoff.worst[0]).toBeCloseTo(6, 6);
		expect(payoff.worst[1]).toBeCloseTo(-2, 6);
	});

	it('normalises weights by the objective’s own ideal value', () => {
		// alpha2 = (ideal2 - worst2) / |ideal2| = (-3 - -2) / 3 = 1/3.
		expect(payoff.weights[0]).toBeCloseTo(3 / 10, 8);
		expect(payoff.weights[1]).toBeCloseTo(7 / 10, 8);
	});
});

describe('buildPayoff (error handling)', () => {
	it('throws when an objective cannot be optimised (infeasible region)', () => {
		const infeasible: Problem = {
			numVars: 1,
			objectives: [{ name: 'z', sense: 'max', coeffs: [1] }],
			constraints: [
				{ coeffs: [1], sense: '<=', rhs: 2 },
				{ coeffs: [1], sense: '>=', rhs: 5 }
			]
		};
		expect(() => buildPayoff(infeasible)).toThrow();
	});

	it('throws when an objective is unbounded on the feasible region', () => {
		// No constraints: max PROFIT = 140x1 + 160x2 over x >= 0 is unbounded.
		// The solver reports this as feasible with result = Infinity, which must
		// be rejected: the STEM ideal point has to be finite.
		const unbounded: Problem = {
			numVars: 2,
			objectives: [
				{ name: 'PROFIT', sense: 'max', coeffs: [140, 160] },
				{ name: 'POLLUTION', sense: 'min', coeffs: [500, 200] }
			],
			constraints: []
		};
		expect(() => buildPayoff(unbounded)).toThrow(/неограничена/);
	});
});

describe('solveIteration (first step, all objectives active)', () => {
	const payoff = buildPayoff(maxMaxProblem);
	const iteration = solveIteration(maxMaxProblem, payoff, [0, 1], []);

	it('finds the hand-computed min-max compromise', () => {
		expect(iteration.feasible).toBe(true);
		expect(iteration.x[0]).toBeCloseTo(1215 / 601, 4);
		expect(iteration.x[1]).toBeCloseTo(1764 / 601, 4);
		expect(iteration.lambda).toBeCloseTo(7644 / 58297, 6);
	});

	it('reports objective values consistent with the decision vector', () => {
		expect(iteration.z[0]).toBeCloseTo(evaluate(maxMaxProblem.objectives[0], iteration.x), 8);
		expect(iteration.z[1]).toBeCloseTo(evaluate(maxMaxProblem.objectives[1], iteration.x), 8);
		expect(iteration.z[0]).toBeCloseTo(7722 / 601, 4);
		expect(iteration.z[1]).toBeCloseTo(6624 / 601, 4);
	});

	it('keeps every weighted deviation within lambda', () => {
		for (const i of iteration.activeObjectives) {
			const d = deviation(
				maxMaxProblem,
				payoff.idealInternal[i],
				payoff.weights[i],
				iteration.x,
				i
			);
			expect(d).toBeLessThanOrEqual(iteration.lambda + TOL);
		}
	});

	it('satisfies the original constraints', () => {
		for (const c of maxMaxProblem.constraints) {
			const lhs = c.coeffs.reduce((sum, a, j) => sum + a * iteration.x[j], 0);
			expect(lhs).toBeLessThanOrEqual(c.rhs + TOL);
		}
	});

	it('copies the active-objective and concession lists instead of aliasing them', () => {
		const active = [0, 1];
		const concessions: Concession[] = [];
		const it = solveIteration(maxMaxProblem, payoff, active, concessions);
		expect(it.activeObjectives).toEqual(active);
		expect(it.activeObjectives).not.toBe(active);
		expect(it.concessions).toEqual(concessions);
		expect(it.concessions).not.toBe(concessions);
	});
});

describe('solveIteration (min objective active)', () => {
	const payoff = buildPayoff(mixedProblem);
	const iteration = solveIteration(mixedProblem, payoff, [0, 1], []);

	it('is feasible and keeps both weighted deviations within lambda', () => {
		expect(iteration.feasible).toBe(true);
		expect(iteration.lambda).toBeGreaterThanOrEqual(0);
		for (const i of iteration.activeObjectives) {
			const d = deviation(mixedProblem, payoff.idealInternal[i], payoff.weights[i], iteration.x, i);
			expect(d).toBeLessThanOrEqual(iteration.lambda + TOL);
		}
	});

	it('respects every original constraint', () => {
		for (const c of mixedProblem.constraints) {
			const lhs = c.coeffs.reduce((sum, a, j) => sum + a * iteration.x[j], 0);
			expect(lhs).toBeLessThanOrEqual(c.rhs + TOL);
		}
	});
});

describe('concessions', () => {
	const payoff = buildPayoff(maxMaxProblem);
	const first = solveIteration(maxMaxProblem, payoff, [0, 1], []);

	it('makeConcession converts a worsening amount into a bound (max objective)', () => {
		const concession = makeConcession(maxMaxProblem, first, 1, 1);
		expect(concession.objective).toBe(1);
		expect(concession.amount).toBe(1);
		// max objective: bound = current value - amount, same in both conventions.
		expect(concession.boundInternal).toBeCloseTo(first.z[1] - 1, 8);
		expect(concession.boundOriginal).toBeCloseTo(first.z[1] - 1, 8);
	});

	it('makeConcession converts a worsening amount into a bound (min objective)', () => {
		const payoffMixed = buildPayoff(mixedProblem);
		const firstMixed = solveIteration(mixedProblem, payoffMixed, [0, 1], []);
		const concession = makeConcession(mixedProblem, firstMixed, 1, 0.5);
		// min objective: the bound in original units is current value + amount.
		expect(concession.boundOriginal).toBeCloseTo(firstMixed.z[1] + 0.5, 8);
		expect(concession.boundInternal).toBeCloseTo(-(firstMixed.z[1] + 0.5), 8);
	});

	it('a loose concession lets the remaining objective reach its ideal value', () => {
		// Relax z2 by 1: bound z2 >= 10.02… is satisfied at the z1-optimum (2, 3),
		// so the next min-max step with only z1 active must return (2, 3), z1 = 13.
		const concession = makeConcession(maxMaxProblem, first, 1, 1);
		const next = solveIteration(maxMaxProblem, payoff, [0], [concession]);

		expect(next.feasible).toBe(true);
		expect(next.x[0]).toBeCloseTo(2, 6);
		expect(next.x[1]).toBeCloseTo(3, 6);
		expect(next.z[0]).toBeCloseTo(13, 6);
		expect(next.lambda).toBeCloseTo(0, 6);
		expect(next.activeObjectives).toEqual([0]);
	});

	it('the relaxed objective respects its concession bound', () => {
		const concession = makeConcession(maxMaxProblem, first, 1, 1);
		const next = solveIteration(maxMaxProblem, payoff, [0], [concession]);
		expect(next.z[1]).toBeGreaterThanOrEqual(concession.boundOriginal - TOL);
	});

	it('reports infeasibility when a concession bound cannot be met', () => {
		// z1 = 2x1 + 3x2 >= 100 is impossible on the feasible region.
		const impossible: Concession = {
			objective: 0,
			amount: 1,
			boundInternal: 100,
			boundOriginal: 100
		};
		const next = solveIteration(maxMaxProblem, payoff, [1], [impossible]);
		expect(next.feasible).toBe(false);
	});
});

describe('iteration bookkeeping', () => {
	it('returns an iteration object with the expected shape', () => {
		const payoff = buildPayoff(maxMaxProblem);
		const it: StemIteration = solveIteration(maxMaxProblem, payoff, [0, 1], []);
		expect(it).toMatchObject({
			feasible: true,
			activeObjectives: [0, 1],
			concessions: []
		});
		expect(it.x).toHaveLength(2);
		expect(it.z).toHaveLength(2);
	});
});

describe('satisfactionPercent', () => {
	it('maps the ideal to 100% and the worst value to 0%', () => {
		expect(satisfactionPercent(13, 6, 13)).toBe(100);
		expect(satisfactionPercent(13, 6, 6)).toBe(0);
	});

	it('interpolates linearly and clamps to the [0, 100] range', () => {
		expect(satisfactionPercent(13, 6, 9.5)).toBeCloseTo(50, 6);
		expect(satisfactionPercent(13, 6, 20)).toBe(100);
		expect(satisfactionPercent(13, 6, 0)).toBe(0);
	});

	it('returns 100% for a constant criterion', () => {
		expect(satisfactionPercent(5, 5, 5)).toBe(100);
	});
});
