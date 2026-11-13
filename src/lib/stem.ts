import { solveLP } from './lp';

export type Sense = 'max' | 'min';
export type ConstraintSense = '<=' | '>=' | '=';

export interface Objective {
	name: string;
	coeffs: number[];
	sense: Sense;
}

export interface Constraint {
	coeffs: number[];
	sense: ConstraintSense;
	rhs: number;
}

export interface Problem {
	numVars: number;
	objectives: Objective[];
	constraints: Constraint[];
}

/** Result of the first STEM phase: optimising each objective on its own. */
export interface PayoffTable {
	/** Best (ideal) value of each objective, in the objective's own units. */
	ideal: number[];
	/** Worst value of each objective across the individual optima. */
	worst: number[];
	/** table[i][j] = value of objective i at the solution that optimises objective j. */
	table: number[][];
	/** solutions[j] = decision vector that optimises objective j. */
	solutions: number[][];
	/** Normalised weights w_i used in the min-max step. */
	weights: number[];
	/** Ideal values expressed in the internal "maximise" convention. */
	idealInternal: number[];
}

/** A concession the decision maker grants on one objective. */
export interface Concession {
	/** Index of the relaxed objective. */
	objective: number;
	/** Amount the objective is allowed to worsen, in its own units. */
	amount: number;
	/** Resulting lower bound in the internal "maximise" convention. */
	boundInternal: number;
	/** Resulting bound in the objective's own units (for display). */
	boundOriginal: number;
}

export interface StemIteration {
	index: number;
	feasible: boolean;
	/** Value of the min-max variable lambda. */
	lambda: number;
	/** Decision vector. */
	x: number[];
	/** Objective values at x, in each objective's own units. */
	z: number[];
	/** Objectives still participating in the min-max step. */
	activeObjectives: number[];
	/** Concessions applied so far. */
	concessions: Concession[];
}

/** Numerical tolerance for treating values as zero. */
export const EPS = 1e-9;

/** +1 for maximisation, -1 for minimisation. */
function sign(objective: Objective): number {
	return objective.sense === 'max' ? 1 : -1;
}

/** Constraint bounds in the solver's format. */
function constraintBounds(
	problem: Problem
): Record<string, { min?: number; max?: number; equal?: number }> {
	const bounds: Record<string, { min?: number; max?: number; equal?: number }> = {};
	problem.constraints.forEach((constraint, index) => {
		const name = `c${index}`;
		if (constraint.sense === '<=') bounds[name] = { max: constraint.rhs };
		else if (constraint.sense === '>=') bounds[name] = { min: constraint.rhs };
		else bounds[name] = { equal: constraint.rhs };
	});
	return bounds;
}

/** Evaluate an objective (in its own units) at a decision vector. */
export function evaluate(objective: Objective, x: number[]): number {
	return objective.coeffs.reduce(
		(sum, coefficient, index) => sum + coefficient * (x[index] ?? 0),
		0
	);
}

/**
 * How close a criterion value is to its ideal, in percent:
 * 100% is the ideal value, 0% is the worst value from the payoff table.
 */
export function satisfactionPercent(ideal: number, worst: number, value: number): number {
	const range = ideal - worst;
	if (Math.abs(range) < EPS) return 100;
	return Math.max(0, Math.min(100, ((value - worst) / range) * 100));
}

/**
 * Phase 1 of STEM: optimise every objective individually to build the payoff
 * table, then derive the ideal point, the worst values and the weights.
 */
export function buildPayoff(problem: Problem): PayoffTable {
	const k = problem.objectives.length;
	const n = problem.numVars;
	const bounds = constraintBounds(problem);

	const solutions: number[][] = [];
	const idealInternal: number[] = [];

	for (let i = 0; i < k; i++) {
		const objective = problem.objectives[i];
		const s = sign(objective);

		const objectiveCoefficients: Record<string, number> = {};
		const variables: Record<string, Record<string, number>> = {};
		for (let j = 0; j < n; j++) {
			objectiveCoefficients[`x${j}`] = s * objective.coeffs[j];
			variables[`x${j}`] = {};
			problem.constraints.forEach((constraint, ci) => {
				variables[`x${j}`][`c${ci}`] = constraint.coeffs[j];
			});
		}

		const result = solveLP({
			opType: 'max',
			objective: objectiveCoefficients,
			constraints: bounds,
			variables
		});

		// The solver reports an unbounded optimum as feasible with an infinite
		// objective value; the STEM ideal point must be finite, so reject both.
		if (!result.feasible || !Number.isFinite(result.objective)) {
			throw new Error(
				`При оптимизации критерия «${objective.name}» задача не имеет допустимого решения или неограничена.`
			);
		}

		const x: number[] = [];
		for (let j = 0; j < n; j++) x.push(result.values[`x${j}`] ?? 0);
		solutions.push(x);
		idealInternal.push(result.objective);
	}

	// table[i][j] = value of objective i (own units) at solution j.
	const table: number[][] = problem.objectives.map((objective) =>
		solutions.map((x) => evaluate(objective, x))
	);

	// For a maximisation objective the ideal value is the row maximum and the
	// worst value the row minimum; for a minimisation objective it is the
	// other way around.
	const ideal = table.map((row, i) =>
		problem.objectives[i].sense === 'max' ? Math.max(...row) : Math.min(...row)
	);
	const worst = table.map((row, i) =>
		problem.objectives[i].sense === 'max' ? Math.min(...row) : Math.max(...row)
	);

	// Relative spread alpha_i = |ideal_i - worst_i| / |ideal_i|, then normalise.
	// The absolute value keeps the spread non-negative for min objectives,
	// whose ideal is numerically smaller than their worst value.
	const alpha = ideal.map((best, i) => {
		const range = Math.abs(best - worst[i]);
		const denominator = Math.abs(best) > EPS ? Math.abs(best) : 1;
		return range / denominator;
	});
	const total = alpha.reduce((sum, value) => sum + value, 0);
	const weights = total > EPS ? alpha.map((value) => value / total) : ideal.map(() => 1 / k);

	return { ideal, worst, table, solutions, weights, idealInternal };
}

/**
 * Phase 2 of STEM: solve the min-max (weighted Chebyshev) problem
 *
 *   min lambda
 *   s.t. lambda >= w_i * (z_i* - z_i(x))   for every active objective i
 *        x in X                            (original constraints)
 *        z_r(x) >= bound_r                 for every relaxed objective r
 */
export function solveIteration(
	problem: Problem,
	payoff: PayoffTable,
	activeObjectives: number[],
	concessions: Concession[]
): StemIteration {
	const n = problem.numVars;
	const constraints = constraintBounds(problem);
	const variables: Record<string, Record<string, number>> = {};
	const objective: Record<string, number> = { lambda: 1 };

	// Decision variables.
	for (let j = 0; j < n; j++) {
		variables[`x${j}`] = {};
		problem.constraints.forEach((constraint, ci) => {
			variables[`x${j}`][`c${ci}`] = constraint.coeffs[j];
		});
	}

	// Min-max variable.
	variables['lambda'] = {};

	// lambda >= w_i * (z_i* - z_i(x))  <=>  lambda + w_i * z_i(x) >= w_i * z_i*
	for (const i of activeObjectives) {
		const objectiveI = problem.objectives[i];
		const s = sign(objectiveI);
		const w = payoff.weights[i];
		const name = `mm${i}`;
		constraints[name] = { min: w * payoff.idealInternal[i] };
		variables['lambda'][name] = 1;
		for (let j = 0; j < n; j++) {
			variables[`x${j}`][name] = w * s * objectiveI.coeffs[j];
		}
	}

	// Concession constraints: z_r(x) >= bound_r (internal convention).
	concessions.forEach((concession, index) => {
		const objectiveR = problem.objectives[concession.objective];
		const s = sign(objectiveR);
		const name = `relax${index}`;
		constraints[name] = { min: concession.boundInternal };
		for (let j = 0; j < n; j++) {
			variables[`x${j}`][name] = s * objectiveR.coeffs[j];
		}
	});

	const result = solveLP({ opType: 'min', objective, constraints, variables });

	const x: number[] = [];
	for (let j = 0; j < n; j++) x.push(result.values[`x${j}`] ?? 0);
	const z = problem.objectives.map((objectiveI) => evaluate(objectiveI, x));

	return {
		index: 0,
		feasible: result.feasible,
		lambda: result.values['lambda'] ?? 0,
		x,
		z,
		activeObjectives: [...activeObjectives],
		concessions: [...concessions]
	};
}

/**
 * Build a concession on `objectiveIndex` from the current iteration: the
 * objective may worsen by `amount` (in its own units).
 */
export function makeConcession(
	problem: Problem,
	iteration: StemIteration,
	objectiveIndex: number,
	amount: number
): Concession {
	const objective = problem.objectives[objectiveIndex];
	const s = sign(objective);
	const internalNow = s * iteration.z[objectiveIndex];
	const boundInternal = internalNow - amount;
	return {
		objective: objectiveIndex,
		amount,
		boundInternal,
		boundOriginal: s * boundInternal
	};
}
