import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '../rule-test-utils.js';
import { censoredMaskRule } from './censored-mask.js';

describe('censored.mask', () => {
	it.each([
		['leading letters', 'f***'],
		['trailing letters', '***ing'],
		['letters on both sides', 'motherf***er'],
		['four stars with a residual letter', 'f****'],
		['multiple asterisk runs', 'f**k***'],
		['Unicode letters and combining marks', 'Føe\u0301***']
	])('replaces the whole candidate for %s', (_label, candidate) => {
		const input = `[Verse]\n${candidate} now`;
		const diagnostics = checkRule(censoredMaskRule, input);
		const fixed = applyRuleFixes(censoredMaskRule, input);

		expect(markedText(input, diagnostics)).toEqual([candidate]);
		expect(fixed).toBe('[Verse]\n**** now');
		expect(checkRule(censoredMaskRule, fixed)).toHaveLength(0);
	});

	it('preserves punctuation and supported markup around each candidate', () => {
		const input = '[Verse]\nSay (<i>f***</i>), then ***ing!';
		const diagnostics = checkRule(censoredMaskRule, input);
		const fixed = applyRuleFixes(censoredMaskRule, input);

		expect(markedText(input, diagnostics)).toEqual(['f***', '***ing']);
		expect(fixed).toBe('[Verse]\nSay (<i>****</i>), then ****!');
		expect(checkRule(censoredMaskRule, fixed)).toHaveLength(0);
	});

	it.each([
		['the correct mask', '****'],
		['an ambiguous short standalone run', '***'],
		['an ambiguous long standalone run', '*****'],
		['a star-wrapped sound effect', '*laughs*'],
		['a heavily star-wrapped sound effect', '**laughs**'],
		['an identifier-like token', 'track_f***'],
		['an alphanumeric token', 'f***2']
	])('does not flag %s', (_label, text) => {
		expect(checkRule(censoredMaskRule, `[Verse]\n${text}`)).toHaveLength(0);
	});
});
