import { describe, expect, it } from 'vitest';
import { emptyTask, parseTaskParams, serializeTaskParams, type TaskForm } from './task-url';

const demo: TaskForm = {
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

describe('parseTaskParams', () => {
	it('reports no task when no task parameter is present', () => {
		expect(parseTaskParams('')).toEqual({ task: null, invalid: false });
		expect(parseTaskParams('?foo=1&bar=2')).toEqual({ task: null, invalid: false });
	});

	it('round-trips a task without the invalid flag', () => {
		const parsed = parseTaskParams(`?${serializeTaskParams(demo)}`);
		expect(parsed.invalid).toBe(false);
		expect(parsed.task).not.toBeNull();
		expect(parsed.task!.numVars).toBe(2);
		expect(parsed.task!.varNames).toEqual(demo.varNames);
		expect(parsed.task!.objectives).toEqual(demo.objectives);
		expect(parsed.task!.constraints).toEqual(demo.constraints);
	});

	it('infers the variable count from the longest coefficient list', () => {
		const parsed = parseTaskParams('?objectives=z1:max:1,2,3');
		expect(parsed.invalid).toBe(false);
		expect(parsed.task!.numVars).toBe(3);
		expect(parsed.task!.objectives[0].coeffs).toEqual([1, 2, 3]);
		expect(parsed.task!.constraints).toEqual([]);
		expect(parsed.task!.varNames).toEqual(['', '', '']);
	});

	it('pads shorter coefficient lists with zeros', () => {
		const parsed = parseTaskParams('?objectives=z1:max:1;z2:min:2,3&constraints=1,2,3:ge:5');
		expect(parsed.task!.numVars).toBe(3);
		expect(parsed.task!.objectives[0].coeffs).toEqual([1, 0, 0]);
		expect(parsed.task!.objectives[1].coeffs).toEqual([2, 3, 0]);
		expect(parsed.task!.constraints[0].coeffs).toEqual([1, 2, 3]);
	});

	it('accepts symbol senses and decimal/negative numbers', () => {
		const parsed = parseTaskParams('?objectives=z1:min:-1.5,2&constraints=-1,0:>=:4');
		expect(parsed.task!.objectives[0].sense).toBe('min');
		expect(parsed.task!.objectives[0].coeffs).toEqual([-1.5, 2]);
		expect(parsed.task!.constraints[0].sense).toBe('>=');
		expect(parsed.task!.constraints[0].rhs).toBe(4);
	});

	it('round-trips names containing separators', () => {
		const query = serializeTaskParams({
			varNames: ['a:b', 'c,d'],
			objectives: [{ name: 'z;1', sense: 'min', coeffs: [1, -2.5] }],
			constraints: []
		});
		const parsed = parseTaskParams(`?${query}`);
		expect(parsed.invalid).toBe(false);
		expect(parsed.task!.varNames).toEqual(['a:b', 'c,d']);
		expect(parsed.task!.objectives[0].name).toBe('z;1');
		expect(parsed.task!.objectives[0].sense).toBe('min');
		expect(parsed.task!.objectives[0].coeffs).toEqual([1, -2.5]);
		expect(parsed.task!.constraints).toEqual([]);
	});

	it('rejects the whole url when any parameter is broken', () => {
		expect(parseTaskParams('?objectives=nonsense')).toEqual({ task: null, invalid: true });
		expect(parseTaskParams('?objectives=z1:max:2,3&constraints=oops')).toEqual({
			task: null,
			invalid: true
		});
		expect(parseTaskParams('?objectives=z1:max:2,3&names=%ZZ')).toEqual({
			task: null,
			invalid: true
		});
	});

	it('rejects the url when objectives are missing but other parameters exist', () => {
		expect(parseTaskParams('?constraints=1,2:le:8')).toEqual({ task: null, invalid: true });
		expect(parseTaskParams('?names=x1,x2')).toEqual({ task: null, invalid: true });
	});
});

describe('serializeTaskParams', () => {
	it('omits empty constraint lists', () => {
		const query = serializeTaskParams({ ...demo, constraints: [] });
		expect(query).not.toContain('constraints');
	});

	it('omits all-empty variable names', () => {
		const query = serializeTaskParams({ ...demo, varNames: ['', ''] });
		expect(query).not.toContain('names');
	});

	it('encodes special characters in names', () => {
		const query = serializeTaskParams({
			varNames: ['a&b=c'],
			objectives: [{ name: 'z1', sense: 'max', coeffs: [1] }],
			constraints: []
		});
		expect(query).toContain(encodeURIComponent('a&b=c'));
	});
});

describe('emptyTask', () => {
	it('starts with one unnamed objective and no constraints', () => {
		const task = emptyTask();
		expect(task.numVars).toBe(1);
		expect(task.objectives).toEqual([{ name: '', sense: 'max', coeffs: [0] }]);
		expect(task.constraints).toEqual([]);
		expect(task.varNames).toEqual(['']);
	});
});
