import type { Constraint, ConstraintSense, Objective, Sense } from './stem';

/**
 * URL round-trip for the problem definition on the /try page.
 *
 * The query uses readable parameters (the variable count is always inferred
 * from the coefficient lists, so there is no `vars` parameter):
 *
 *   ?objectives=z1:max:2,3;z2:max:4,1
 *   &constraints=1,2:le:8;3,1:le:9
 *   &names=x1,x2
 *
 * - `objectives` item: `name:sense:coeffs`, sense is `max` or `min`;
 * - `constraints` item: `coeffs:sense:rhs`, sense is `le`, `ge` or `eq`
 *   (the symbols `<=`, `>=`, `=`, `≤`, `≥` are also accepted);
 * - `names`: comma-separated variable names, blanks fall back to x1…xn.
 *
 * Items are separated by `;`, coefficients by `,`. Variable names are
 * percent-encoded per piece, so they may contain `:`, `,` and `;` while the
 * separators stay literal and the URL stays readable.
 *
 * Parsing is all-or-nothing: when any task parameter is present but broken
 * (or `objectives` is missing while other parameters exist), the whole URL
 * is rejected — there is no partial salvage.
 */

/**
 * The problem definition exactly as it is edited in the form. The variable
 * count is not part of the definition: it is always inferred from the
 * coefficient lists.
 */
export interface TaskForm {
	varNames: string[];
	objectives: Objective[];
	constraints: Constraint[];
}

/** A task parsed from the URL. */
export interface ParsedTaskForm extends TaskForm {
	/** Variable count inferred from the longest coefficient list. */
	numVars: number;
}

/** Result of parsing a query string. */
export interface ParseResult {
	/** Parsed task, or null when the URL does not define a valid one. */
	task: ParsedTaskForm | null;
	/** True when task parameters were present but could not be parsed. */
	invalid: boolean;
}

const OBJECTIVES_KEY = 'objectives';
const CONSTRAINTS_KEY = 'constraints';
const NAMES_KEY = 'names';

/** An empty task: one unnamed maximisation objective, no constraints. */
export function emptyTask(): ParsedTaskForm {
	return {
		numVars: 1,
		varNames: [''],
		objectives: [{ name: '', sense: 'max', coeffs: [0] }],
		constraints: []
	};
}

/** Variable count inferred from the longest coefficient list. */
export function inferNumVars(task: Pick<TaskForm, 'objectives' | 'constraints'>): number {
	return Math.max(
		1,
		...task.objectives.map((objective) => objective.coeffs.length),
		...task.constraints.map((constraint) => constraint.coeffs.length)
	);
}

/**
 * Parse the problem definition from a query string (`?a=b` or `a=b`).
 * Returns `{ task: null, invalid: false }` when no task parameter is present
 * at all, and `{ task: null, invalid: true }` when the parameters are present
 * but broken.
 */
export function parseTaskParams(search: string): ParseResult {
	const params = rawQueryParams(search);
	const hasObjectives = params.has(OBJECTIVES_KEY);
	const hasConstraints = params.has(CONSTRAINTS_KEY);
	const hasNames = params.has(NAMES_KEY);
	if (!hasObjectives && !hasConstraints && !hasNames) return { task: null, invalid: false };

	const objectives = hasObjectives ? parseObjectivesParam(params.get(OBJECTIVES_KEY) ?? '') : null;
	const constraints = hasConstraints
		? parseConstraintsParam(params.get(CONSTRAINTS_KEY) ?? '')
		: [];
	const names = hasNames ? parseNamesParam(params.get(NAMES_KEY) ?? '') : [];

	if (!objectives || !constraints || !names) return { task: null, invalid: true };

	// The variable count is always inferred from the longest coefficient list.
	const numVars = inferNumVars({ objectives, constraints });
	for (const objective of objectives) padCoeffs(objective.coeffs, numVars);
	for (const constraint of constraints) padCoeffs(constraint.coeffs, numVars);
	while (names.length < numVars) names.push('');
	names.length = numVars;

	return { task: { numVars, varNames: names, objectives, constraints }, invalid: false };
}

/**
 * Serialize a problem definition into a query string (without the leading
 * `?`). Empty constraint lists and all-empty variable names are omitted.
 */
export function serializeTaskParams(task: TaskForm): string {
	const parts: string[] = [];

	const objectiveItems = task.objectives.map((objective, index) => {
		const name = objective.name.trim() || `z${index + 1}`;
		const coeffs = objective.coeffs.map(numberToParam).join(',');
		return `${encodeURIComponent(name)}:${objective.sense}:${coeffs}`;
	});
	parts.push(`${OBJECTIVES_KEY}=${objectiveItems.join(';')}`);

	if (task.constraints.length > 0) {
		const constraintItems = task.constraints.map((constraint) => {
			const coeffs = constraint.coeffs.map(numberToParam).join(',');
			return `${coeffs}:${senseToParam(constraint.sense)}:${numberToParam(constraint.rhs)}`;
		});
		parts.push(`${CONSTRAINTS_KEY}=${constraintItems.join(';')}`);
	}

	const names = task.varNames.map((name) => name.trim());
	if (names.some((name) => name !== '')) {
		parts.push(`${NAMES_KEY}=${names.map((name) => encodeURIComponent(name)).join(',')}`);
	}

	return parts.join('&');
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Split a query string into raw (still percent-encoded) values. Unlike
 * `URLSearchParams`, decoding is left to the piece level, so names encoded
 * with `encodeURIComponent` round-trip even when they contain `:`, `,` or `;`.
 */
function rawQueryParams(search: string): Map<string, string> {
	const map = new Map<string, string>();
	const query = search.startsWith('?') ? search.slice(1) : search;
	if (query === '') return map;
	for (const pair of query.split('&')) {
		if (pair === '') continue;
		const eq = pair.indexOf('=');
		const key = eq === -1 ? pair : pair.slice(0, eq);
		const value = eq === -1 ? '' : pair.slice(eq + 1);
		if (!map.has(key)) map.set(key, value);
	}
	return map;
}

/** Split `a:b:c` items on `;`; `null` when an item does not have three parts. */
function parseTriples(raw: string): [string, string, string][] | null {
	const items = splitItems(raw);
	if (items === null) return null;
	const triples: [string, string, string][] = [];
	for (const item of items) {
		const parts = item.split(':');
		if (parts.length !== 3) return null;
		triples.push([parts[0], parts[1], parts[2]]);
	}
	return triples;
}

function parseObjectivesParam(raw: string): Objective[] | null {
	const triples = parseTriples(raw);
	if (triples === null) return null;
	const objectives: Objective[] = [];
	for (const [rawName, rawSense, rawCoeffs] of triples) {
		const name = decodePiece(rawName)?.trim() ?? '';
		const sense = parseObjectiveSense(rawSense.trim());
		const coeffs = parseNumberList(rawCoeffs);
		if (!name || !sense || !coeffs) return null;
		objectives.push({ name, sense, coeffs });
	}
	return objectives;
}

function parseConstraintsParam(raw: string): Constraint[] | null {
	const triples = parseTriples(raw);
	if (triples === null) return null;
	const constraints: Constraint[] = [];
	for (const [rawCoeffs, rawSense, rawRhs] of triples) {
		const coeffs = parseNumberList(rawCoeffs);
		const sense = parseConstraintSense(rawSense.trim());
		const rhs = parseNumber(decodePiece(rawRhs) ?? '');
		if (!coeffs || !sense || rhs === null) return null;
		constraints.push({ coeffs, sense, rhs });
	}
	return constraints;
}

function parseNamesParam(raw: string): string[] | null {
	const names: string[] = [];
	for (const piece of raw.split(',')) {
		const decoded = decodePiece(piece);
		if (decoded === null) return null;
		names.push(decoded.trim());
	}
	return names;
}

/** Split on `;` and drop empty items; `null` when nothing remains. */
function splitItems(raw: string): string[] | null {
	const items = raw
		.split(';')
		.map((item) => item.trim())
		.filter((item) => item !== '');
	return items.length > 0 ? items : null;
}

function parseObjectiveSense(raw: string): Sense | null {
	return raw === 'max' || raw === 'min' ? raw : null;
}

function parseConstraintSense(raw: string): ConstraintSense | null {
	if (raw === 'le' || raw === '<=' || raw === '≤') return '<=';
	if (raw === 'ge' || raw === '>=' || raw === '≥') return '>=';
	if (raw === 'eq' || raw === '=') return '=';
	return null;
}

function parseNumberList(raw: string): number[] | null {
	const values: number[] = [];
	for (const piece of raw.split(',')) {
		const value = parseNumber(decodePiece(piece) ?? '');
		if (value === null) return null;
		values.push(value);
	}
	return values;
}

function parseNumber(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : null;
}

/** Decode one percent-encoded piece; `null` on malformed input. */
function decodePiece(raw: string): string | null {
	try {
		return decodeURIComponent(raw);
	} catch {
		return null;
	}
}

/** Pad a coefficient list with zeros up to `numVars`. */
function padCoeffs(coeffs: number[], numVars: number): void {
	while (coeffs.length < numVars) coeffs.push(0);
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function numberToParam(value: number): string {
	return Number.isFinite(value) ? String(value) : '0';
}

function senseToParam(sense: ConstraintSense): string {
	return sense === '<=' ? 'le' : sense === '>=' ? 'ge' : 'eq';
}
