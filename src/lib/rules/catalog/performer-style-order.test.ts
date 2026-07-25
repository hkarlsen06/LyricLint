import { describe, expect, it } from 'vitest';
import { performerStyleOrderRule as rule } from './performer-style-order.js';
import { applyRuleFixes, checkRule } from '../rule-test-utils.js';

function fix(text: string) {
	return checkRule(rule, text)[0]?.fixes?.[0];
}

describe('performer.style-order', () => {
	it('reorders the legend without touching the lyrics when the slots are already 1..n', () => {
		const text = '[Chorus: A, <b>B</b> & <i>C</i>]\nPlain line\n<i>Second voice</i>\n<b>Third</b>';

		expect(fix(text)?.label).toBe('Reorder legend groups');
		expect(fix(text)?.edit.edits).toHaveLength(1);
		expect(applyRuleFixes(rule, text)).toBe(
			'[Chorus: A, <i>C</i> & <b>B</b>]\nPlain line\n<i>Second voice</i>\n<b>Third</b>'
		);
	});

	it('drops the markers when a section styled all the way through names one voice', () => {
		const text = '[Verse: <i>Blair</i>]\n<i>First light</i>\n<i>Then dark</i>';

		expect(fix(text)?.label).toBe('Remove performer formatting');
		expect(applyRuleFixes(rule, text)).toBe('[Verse: Blair]\nFirst light\nThen dark');
	});

	it('shifts every group down together when the legend skips the plain slot', () => {
		expect(applyRuleFixes(rule, '[Verse: <i>A</i> & <b>B</b>]\n<i>One</i>\n<b>Two</b>')).toBe(
			'[Verse: A & <i>B</i>]\nOne\n<i>Two</i>'
		);
		expect(
			applyRuleFixes(
				rule,
				'[Verse: <i>A</i>, <b>B</b> & <i><b>C</b></i>]\n<i>One</i>\n<i><b>Two</b></i>'
			)
		).toBe('[Verse: A, <i>B</i> & <b>C</b>]\nOne\n<b>Two</b>');
	});

	it('rewrites only the markers of a wrapper that spans several lines', () => {
		expect(applyRuleFixes(rule, '[Verse: <b>A</b>]\n<b>First\nSecond\nThird</b>')).toBe(
			'[Verse: A]\nFirst\nSecond\nThird'
		);
		expect(
			applyRuleFixes(
				rule,
				'[Verse: <b>A</b> & <i><b>B</b></i>]\n<b>First\nSecond</b>\n<i><b>Joint</b></i>'
			)
		).toBe('[Verse: A & <i>B</i>]\nFirst\nSecond\n<i>Joint</i>');
	});

	it('reorders and restyles in the same edit', () => {
		expect(
			applyRuleFixes(rule, '[Verse: <i><b>A</b></i> & <b>B</b>]\n<i><b>One</b></i>\n<b>Two</b>')
		).toBe('[Verse: B & <i>A</i>]\n<i>One</i>\nTwo');
	});

	it('reports without a fix when plain lyrics would absorb the group moving into plain', () => {
		const text = '[Verse: <i>Blair</i>]\nPlain line\n<i>Styled line</i>';
		const [finding] = checkRule(rule, text);

		expect(finding?.message).toBe('Performer legend styles are out of slot order.');
		expect(finding?.fixes).toBeUndefined();
		expect(finding?.explanation).toContain('by hand');
	});

	it('reports without a fix when two groups share one slot', () => {
		expect(fix('[Verse: <i>A</i>, <i>B</i>]\n<i>One</i>')).toBeUndefined();
	});

	it('reports without a fix when the section carries markup it cannot interpret', () => {
		expect(fix('[Verse: <i>A</i>]\n<i>One</i>\n<u>Two</u>')).toBeUndefined();
		expect(fix('[Verse: <u>A</u> & <i>B</i>]\n<i>One</i>')).toBeUndefined();
	});

	it('reports without a fix when the body styles a slot the legend does not name', () => {
		expect(fix('[Verse: <i>A</i>]\n<i>One</i>\n<b>Two</b>')).toBeUndefined();
	});

	it('keeps an ampersand that belongs to one group inside its own wrapper', () => {
		expect(applyRuleFixes(rule, '[Verse: <i>A &amp; B</i>]\n<i>One</i>')).toBe(
			'[Verse: A &amp; B]\nOne'
		);
		expect(applyRuleFixes(rule, '[Verse: A & B, <b>C</b>]\n<b>One</b>')).toBe(
			'[Verse: A & B & <i>C</i>]\n<i>One</i>'
		);
	});

	it('leaves a legend that is already in slot order alone', () => {
		expect(checkRule(rule, '[Verse: A, <i>B</i>, <b>C</b> & <i><b>D</b></i>]\nLine')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nLine')).toEqual([]);
	});
});
