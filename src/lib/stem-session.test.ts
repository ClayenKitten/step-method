import { describe, expect, it } from 'vitest';
import {
	accept,
	concede,
	emptySession,
	mostSatisfiedActive,
	startSession,
	stepBack
} from './stem-session';
import type { TaskForm } from './task-url';

describe('stem-session', () => {
	// The classic two-objective demo problem, hand-verified in stem.test.ts.
	const form: TaskForm = {
		varNames: ['x1', 'x2'],
		objectives: [
			{ name: 'z1', sense: 'max', coeffs: [2, 3] },
			{ name: 'z2', sense: 'max', coeffs: [4, 1] }
		],
		constraints: [
			{ coeffs: [1, 2], sense: '<=', rhs: 8 },
			{ coeffs: [3, 1], sense: '<=', rhs: 9 }
		]
	};

	it('starts a session with the payoff table and the first iteration', () => {
		const session = startSession(form);
		expect(session.phase).toBe('results');
		expect(session.error).toBeNull();
		expect(session.iterations).toHaveLength(1);
		expect(session.iterations[0].index).toBe(1);
		expect(session.activeObjectives).toEqual([0, 1]);
		expect(session.concessions).toEqual([]);
		expect(session.problem?.numVars).toBe(2);
		expect(session.payoff?.ideal).toEqual([13, 12]);
	});

	it('keeps the input phase and reports an error for an unsolvable problem', () => {
		const session = startSession({
			objectives: [{ name: 'z1', sense: 'max', coeffs: [1] }],
			constraints: [{ coeffs: [1], sense: '<=', rhs: -5 }]
		});
		expect(session.phase).toBe('input');
		expect(session.problem).toBeNull();
		expect(session.error).not.toBeNull();
	});

	it('concedes, steps back and accepts', () => {
		let session = startSession(form);

		session = concede(session, 0, 1);
		expect(session.error).toBeNull();
		expect(session.iterations).toHaveLength(2);
		expect(session.iterations[1].index).toBe(2);
		expect(session.activeObjectives).toEqual([1]);
		expect(session.concessions).toHaveLength(1);

		session = stepBack(session);
		expect(session.iterations).toHaveLength(1);
		expect(session.activeObjectives).toEqual([0, 1]);
		expect(session.concessions).toHaveLength(0);
		expect(session.accepted).toBe(false);

		session = concede(session, 0, 1);
		session = accept(session);
		expect(session.accepted).toBe(true);
	});

	it('rejects a negative concession without advancing', () => {
		const session = startSession(form);
		const next = concede(session, 0, -1);
		expect(next.error).toBe('Величина уступки должна быть неотрицательной.');
		expect(next.iterations).toHaveLength(1);
		expect(next.activeObjectives).toEqual([0, 1]);
	});

	it('rejects a concession when only one active objective remains', () => {
		const session = startSession(form);
		const next = concede(session, session.activeObjectives[0], 0);
		// After conceding, only one objective stays active; a further concession
		// attempt must be refused with the dedicated message.
		const single = concede({ ...next, activeObjectives: [0] }, 0, 0);
		expect(single.error).toBe(
			'В минимаксной задаче должен оставаться хотя бы один активный критерий.'
		);
	});

	it('suggests the active criterion closest to its ideal', () => {
		const session = startSession(form);
		const hint = mostSatisfiedActive(session);
		expect(hint).not.toBeNull();
		expect(hint!.index).toBeGreaterThanOrEqual(0);
		expect(hint!.percent).toBeGreaterThan(0);
		expect(hint!.percent).toBeLessThanOrEqual(100);
	});

	it('returns the session unchanged from an empty session', () => {
		const session = emptySession();
		expect(concede(session, 0, 1)).toBe(session);
		expect(stepBack(session)).toBe(session);
	});
});
