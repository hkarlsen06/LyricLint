import { describe, expect, it } from 'vitest';
import { capitalizationLineStartRule as rule } from './capitalization-line-start.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('capitalization.line-start', () => {
	it('marks exactly the first visible character and previews its uppercase form', () => {
		const text = '[Verse]\nthe night is young';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['t']);
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'preview',
			label: 'Capitalize t',
			edit: { baseRevision: testRevision }
		});
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\nThe night is young');
	});

	it('skips leading whitespace and literal markup when locating the line start', () => {
		const indented = '[Verse]\n  the night is young';
		expect(checkRule(rule, indented)[0]?.from).toBe(10);

		const styled = '[Verse]\n<i>the night is young</i>';
		expect(checkRule(rule, styled)[0]?.from).toBe(11);
		expect(applyRuleFixes(rule, styled)).toBe('[Verse]\n<i>The night is young</i>');

		expect(checkRule(rule, '[Verse]\n<u>the night is young</u>')).toEqual([]);
	});

	it('only runs for the reviewed English and Norwegian language tags', () => {
		for (const language of ['en', 'en-GB', 'no', 'no-NB']) {
			expect(checkRule(rule, '[Verse]\nthe night is young', { language })).toHaveLength(1);
		}
		for (const language of ['fr', 'de', 'nob', 'english']) {
			expect(checkRule(rule, '[Verse]\nthe night is young', { language })).toEqual([]);
		}
	});

	it('needs a second word before suggesting a sentence start', () => {
		expect(checkRule(rule, '[Verse]\nsolo')).toEqual([]);
	});

	it('leaves stylized lowercase openings alone', () => {
		expect(checkRule(rule, '[Verse]\niPhone lights glow')).toEqual([]);
		expect(checkRule(rule, '[Verse]\niOS and the rest')).toEqual([]);
		// The first-word pattern stops at the dot, so this exception has to be
		// matched against the visible line text.
		expect(checkRule(rule, '[Verse]\ne.e. cummings wrote this')).toEqual([]);
	});

	it('replaces only the base character of a decomposed letter', () => {
		const composed = '[Verse]\n\u00E9clair and cream';
		expect(fixInserts(checkRule(rule, composed))).toEqual(['\u00C9']);

		const decomposed = '[Verse]\ne\u0301clair and cream';
		expect(markedText(decomposed, checkRule(rule, decomposed))).toEqual(['e']);
		expect(applyRuleFixes(rule, decomposed)).toBe('[Verse]\nE\u0301clair and cream');
	});

	it('stays silent when the line does not open on a lowercase letter', () => {
		expect(checkRule(rule, '[Verse]\n🌙 the night')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n(yeah) the night')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nكلمات عربية هنا')).toEqual([]);
	});

	it('reports each lyric line and never the section header', () => {
		const text = '[Verse]\nthe night\nand the day';
		expect(markedText(text, checkRule(rule, text))).toEqual(['t', 'a']);
		expect(checkRule(rule, '[verse]\nGo now')).toEqual([]);
	});
});
