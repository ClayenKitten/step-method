import {
	buildPayoff,
	makeConcession,
	satisfactionPercent,
	solveIteration,
	type Concession,
	type PayoffTable,
	type Problem,
	type StemIteration
} from './stem';
import { inferNumVars, type TaskForm } from './task-url';

/**
 * Interactive STEM session: the full state machine between the computer and
 * the decision maker, kept out of the /try component so it can be tested
 * without mounting anything. Every operation returns a new session; `error`
 * carries the message of the last failed operation (null after success).
 */
export interface StemSession {
	/** 'input' while the form is edited, 'results' once the first step is solved. */
	phase: 'input' | 'results';
	problem: Problem | null;
	payoff: PayoffTable | null;
	iterations: StemIteration[];
	/** Objectives still participating in the min-max step. */
	activeObjectives: number[];
	/** Concessions granted so far. */
	concessions: Concession[];
	accepted: boolean;
	error: string | null;
}

/** The parts of the form the solver needs. */
export type SessionInput = Pick<TaskForm, 'objectives' | 'constraints'>;

/** A fresh session in the form-editing phase. */
export function emptySession(): StemSession {
	return {
		phase: 'input',
		problem: null,
		payoff: null,
		iterations: [],
		activeObjectives: [],
		concessions: [],
		accepted: false,
		error: null
	};
}

/** The latest iteration, or null before the first solve. */
export function currentIteration(session: StemSession): StemIteration | null {
	return session.iterations[session.iterations.length - 1] ?? null;
}

/**
 * Solve the problem from the form: build the payoff table and the first
 * min-max iteration. On failure returns a session in the input phase with
 * `error` set.
 */
export function startSession(input: SessionInput): StemSession {
	try {
		// The variable count is inferred from the coefficient lists, mirroring
		// the URL machinery; padding keeps ragged input from producing NaNs.
		const numVars = inferNumVars(input);
		const problem: Problem = {
			numVars,
			objectives: input.objectives.map((objective) => ({
				...objective,
				coeffs: padCoeffs([...objective.coeffs], numVars)
			})),
			constraints: input.constraints.map((constraint) => ({
				...constraint,
				coeffs: padCoeffs([...constraint.coeffs], numVars)
			}))
		};

		const payoff = buildPayoff(problem);
		const activeObjectives = problem.objectives.map((_, i) => i);
		const first = solveIteration(problem, payoff, activeObjectives, []);
		first.index = 1;

		return {
			phase: 'results',
			problem,
			payoff,
			iterations: [first],
			activeObjectives,
			concessions: [],
			accepted: false,
			error: null
		};
	} catch (e) {
		return { ...emptySession(), error: toMessage(e) };
	}
}

/**
 * Grant a concession on `choice` and solve the next min-max iteration. On
 * failure returns the session unchanged except for `error`.
 */
export function concede(session: StemSession, choice: number, amount: number): StemSession {
	const problem = session.problem;
	const payoff = session.payoff;
	const current = currentIteration(session);
	if (!problem || !payoff || !current) return session;

	if (session.activeObjectives.length <= 1) {
		return {
			...session,
			error: 'В минимаксной задаче должен оставаться хотя бы один активный критерий.'
		};
	}
	if (amount < 0) {
		return { ...session, error: 'Величина уступки должна быть неотрицательной.' };
	}

	const concession = makeConcession(problem, current, choice, amount);
	const concessions = [...session.concessions, concession];
	const activeObjectives = session.activeObjectives.filter((i) => i !== choice);

	try {
		const next = solveIteration(problem, payoff, activeObjectives, concessions);
		if (!next.feasible) {
			return {
				...session,
				error:
					'При такой уступке минимаксная задача не имеет допустимого решения. Попробуйте увеличить уступку.'
			};
		}
		next.index = session.iterations.length + 1;
		return {
			...session,
			error: null,
			concessions,
			activeObjectives,
			iterations: [...session.iterations, next]
		};
	} catch (e) {
		return { ...session, error: toMessage(e) };
	}
}

/** Undo the last concession; no-op while only the first iteration exists. */
export function stepBack(session: StemSession): StemSession {
	if (session.iterations.length <= 1) return session;
	const iterations = session.iterations.slice(0, -1);
	const restored = iterations[iterations.length - 1];
	return {
		...session,
		error: null,
		accepted: false,
		iterations,
		activeObjectives: [...restored.activeObjectives],
		concessions: [...restored.concessions]
	};
}

/** Accept the current compromise solution. */
export function accept(session: StemSession): StemSession {
	return { ...session, accepted: true };
}

/**
 * The active criterion that is currently closest to its ideal, with its
 * satisfaction percentage — the usual candidate for a concession.
 */
export function mostSatisfiedActive(
	session: StemSession
): { index: number; percent: number } | null {
	const payoff = session.payoff;
	const current = currentIteration(session);
	if (!payoff || !current || session.activeObjectives.length === 0) return null;

	let best = session.activeObjectives[0];
	for (const i of session.activeObjectives) {
		if (
			satisfactionPercent(payoff.ideal[i], payoff.worst[i], current.z[i]) >
			satisfactionPercent(payoff.ideal[best], payoff.worst[best], current.z[best])
		) {
			best = i;
		}
	}
	return {
		index: best,
		percent: satisfactionPercent(payoff.ideal[best], payoff.worst[best], current.z[best])
	};
}

/** Pad a coefficient list with zeros up to `numVars`. */
function padCoeffs(coeffs: number[], numVars: number): number[] {
	while (coeffs.length < numVars) coeffs.push(0);
	return coeffs;
}

function toMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
