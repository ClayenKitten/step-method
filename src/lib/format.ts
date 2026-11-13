import type { ConstraintSense } from './stem';

/** Format a number for display: up to four decimals, '—' when not finite. */
export function fmt(value: number): string {
	if (!Number.isFinite(value)) return '—';
	return Number(value.toFixed(4)).toString();
}

/** Display name of variable j; falls back to x<j+1> when left blank. */
export function varLabel(j: number, varNames: string[]): string {
	const name = varNames[j]?.trim();
	return name ? name : `x${j + 1}`;
}

/** Render a linear form such as "2x1 + 3x2" or "−x1 + 4x2". */
export function formatLinear(coeffs: number[], varNames: string[]): string {
	const parts: string[] = [];
	coeffs.forEach((coefficient, j) => {
		if (coefficient === 0) return;
		const magnitude = Math.abs(coefficient);
		const term = magnitude === 1 ? varLabel(j, varNames) : `${magnitude}·${varLabel(j, varNames)}`;
		if (parts.length === 0) {
			parts.push(coefficient < 0 ? `−${term}` : term);
		} else {
			parts.push(`${coefficient < 0 ? '−' : '+'} ${term}`);
		}
	});
	return parts.length ? parts.join(' ') : '0';
}

/** Display symbol for a constraint sense. */
export function senseSymbol(sense: ConstraintSense): string {
	if (sense === '<=') return '≤';
	if (sense === '>=') return '≥';
	return '=';
}
