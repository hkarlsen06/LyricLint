import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '../rule-test-utils.js';
import { textInvisibleCharactersRule as rule } from './text-invisible-characters.js';

const NBSP = String.fromCodePoint(0x00a0);
const NARROW_NBSP = String.fromCodePoint(0x202f);
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);
const ZERO_WIDTH_JOINER = String.fromCodePoint(0x200d);
const RIGHT_TO_LEFT_MARK = String.fromCodePoint(0x200f);

function count(text: string): number {
	return checkRule(rule, text).length;
}

describe('text.invisible-characters', () => {
	it('replaces space-like characters with an ordinary space', () => {
		expect(applyRuleFixes(rule, `[Verse]\nA${NBSP}lyric`)).toBe('[Verse]\nA lyric');
		expect(applyRuleFixes(rule, `[Verse]\nA${NARROW_NBSP}lyric`)).toBe('[Verse]\nA lyric');
	});

	it('removes characters that occupy no width', () => {
		expect(applyRuleFixes(rule, `[Verse]\nA${ZERO_WIDTH_SPACE}lyric`)).toBe('[Verse]\nAlyric');
		expect(applyRuleFixes(rule, `${BYTE_ORDER_MARK}[Verse]\nA lyric`)).toBe('[Verse]\nA lyric');
	});

	it('strips trailing whitespace without touching the lyric', () => {
		expect(applyRuleFixes(rule, '[Verse]\nA lyric   \nAnother  ')).toBe(
			'[Verse]\nA lyric\nAnother'
		);
	});

	it('preserves CRLF when removing trailing whitespace', () => {
		expect(applyRuleFixes(rule, '[Verse]\r\nA lyric  \r\nAnother')).toBe(
			'[Verse]\r\nA lyric\r\nAnother'
		);
	});

	it('empties a whitespace-only line rather than deleting the line', () => {
		expect(applyRuleFixes(rule, '[Verse]\nFirst\n   \n[Chorus]\nSecond')).toBe(
			'[Verse]\nFirst\n\n[Chorus]\nSecond'
		);
	});

	it('reports a trailing run once instead of per character', () => {
		const input = '[Verse]\nA lyric   ';
		const findings = checkRule(rule, input);
		expect(findings).toHaveLength(1);
		expect(markedText(input, findings)).toEqual(['   ']);
	});

	it('reports a trailing non-breaking space once, as trailing whitespace', () => {
		// It is both an invisible character and trailing whitespace. Two safe
		// fixes on the same offsets would collide in arbitration.
		const input = `[Verse]\nA lyric${NBSP}`;
		const findings = checkRule(rule, input);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.fixes?.[0]?.label).toBe('Remove trailing whitespace');
	});

	it('never touches joiners or bidi marks', () => {
		expect(count(`[Verse]\nA${ZERO_WIDTH_JOINER}lyric`)).toBe(0);
		expect(count(`[Verse]\nA lyric${RIGHT_TO_LEFT_MARK}`)).toBe(0);
		expect(count('[Verse]\n👨‍👩‍👧 family')).toBe(0);
	});

	it('marks exactly one code unit per character', () => {
		const input = `[Verse]\n🌙${ZERO_WIDTH_SPACE}moon`;
		expect(markedText(input, checkRule(rule, input))).toEqual([ZERO_WIDTH_SPACE]);
	});

	it('finds nothing in a clean document', () => {
		expect(count('[Verse]\nA lyric\n\n[Chorus]\nAnother')).toBe(0);
	});
});
