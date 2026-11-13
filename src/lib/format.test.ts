import { describe, expect, it } from 'vitest';
import { fmt, formatLinear, senseSymbol, varLabel } from './format';

describe('fmt', () => {
	it('rounds to four decimals and strips trailing zeros', () => {
		expect(fmt(1.23456789)).toBe('1.2346');
		expect(fmt(2)).toBe('2');
		expect(fmt(0.5)).toBe('0.5');
	});

	it('shows a dash for non-finite values', () => {
		expect(fmt(Number.NaN)).toBe('—');
		expect(fmt(Number.POSITIVE_INFINITY)).toBe('—');
	});
});

describe('varLabel', () => {
	it('falls back to x<j+1> for blank names', () => {
		const names = ['', 'x', '  '];
		expect(varLabel(0, names)).toBe('x1');
		expect(varLabel(1, names)).toBe('x');
		expect(varLabel(2, names)).toBe('x3');
	});
});

describe('formatLinear', () => {
	const names = ['a', 'b'];

	it('renders positive and negative terms', () => {
		expect(formatLinear([2, 3], names)).toBe('2·a + 3·b');
		expect(formatLinear([-1, 4], names)).toBe('−a + 4·b');
		expect(formatLinear([1, -1], names)).toBe('a − b');
	});

	it('skips zero coefficients and renders an all-zero form as "0"', () => {
		expect(formatLinear([0, 2], names)).toBe('2·b');
		expect(formatLinear([0, 0], names)).toBe('0');
	});
});

describe('senseSymbol', () => {
	it('maps senses to display symbols', () => {
		expect(senseSymbol('<=')).toBe('≤');
		expect(senseSymbol('>=')).toBe('≥');
		expect(senseSymbol('=')).toBe('=');
	});
});
