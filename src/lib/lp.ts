import solver from 'javascript-lp-solver';
import type { Model, SolveResult } from 'javascript-lp-solver';

export type OpType = 'max' | 'min';

/**
 * A thin, typed wrapper around `javascript-lp-solver`.
 *
 * The underlying library expects the objective coefficients to live inside the
 * per-variable coefficient map (keyed by the name given in `optimize`). This
 * wrapper keeps the objective separate for readability and merges it in.
 */
export interface LPModel {
	/** Whether the objective is maximised or minimised. */
	opType: OpType;
	/** Objective coefficient per variable name. */
	objective: Record<string, number>;
	/**
	 * Constraints keyed by name. Each bound is one of `{ max }` (<=),
	 * `{ min }` (>=) or `{ equal }` (=).
	 */
	constraints: Record<string, { min?: number; max?: number; equal?: number }>;
	/** Constraint coefficients per variable name, keyed by constraint name. */
	variables: Record<string, Record<string, number>>;
}

export interface LPResult {
	feasible: boolean;
	/** Optimal objective value (NaN when infeasible). */
	objective: number;
	/** Value of every variable (0 when the solver did not report it). */
	values: Record<string, number>;
}

const OBJECTIVE_KEY = 'obj';

export function solveLP(model: LPModel): LPResult {
	const variables: Record<string, Record<string, number>> = {};
	for (const [name, coefficients] of Object.entries(model.variables)) {
		variables[name] = { ...coefficients, [OBJECTIVE_KEY]: model.objective[name] ?? 0 };
	}

	const jsModel: Model = {
		optimize: OBJECTIVE_KEY,
		opType: model.opType,
		constraints: model.constraints,
		variables
	};

	const result = solver.Solve(jsModel) as SolveResult;

	const values: Record<string, number> = {};
	for (const name of Object.keys(model.variables)) {
		const value = result[name];
		values[name] = typeof value === 'number' ? value : 0;
	}

	return {
		feasible: Boolean(result.feasible),
		objective: typeof result.result === 'number' ? result.result : Number.NaN,
		values
	};
}
