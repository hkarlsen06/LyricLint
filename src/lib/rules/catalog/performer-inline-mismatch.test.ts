import { describe, expect, it } from 'vitest';
import { checkRule, markedText } from '../rule-test-utils.js';
import { performerInlineMismatchRule as rule } from './performer-inline-mismatch.js';

describe('performer.inline-mismatch', () => {
	it('marks each unaccounted slot once, anchored on its first styled span', () => {
		const text = '[Verse: A]\n<i>Second voice</i> and <b>third voice</b>\n<i>Second again</i>';
		const findings = checkRule(rule, text, { performers: ['A', 'B', 'C'] });

		expect(markedText(text, findings)).toEqual(['<i>Second voice</i>', '<b>third voice</b>']);
		expect(findings.map((finding) => finding.message)).toEqual([
			'A styled voice is not yet named in the section legend.',
			'A styled voice is not yet named in the section legend.'
		]);
		expect(findings.every((finding) => finding.fixes === undefined)).toBe(true);
		// The claim is about the voice, so the ignore keys on the voice: the
		// identity is the styling's name, never the lyrics it happens to flag.
		expect(findings.map((finding) => finding.identityText)).toEqual([
			'Unknown italic voice',
			'Unknown bold voice'
		]);
	});

	it('is silent in a section with no legend at all', () => {
		// That state is performer.header-required's one header-anchored finding —
		// and, below its roster gate, the formatting-first workflow left in peace.
		expect(checkRule(rule, '[Verse]\n<i>Second voice</i>', { performers: ['A', 'B'] })).toEqual([]);
	});

	it('reads slots from the parsed legend rather than the global roster', () => {
		expect(
			checkRule(rule, '[Verse: A & <i>B</i>]\n<i>Second voice</i>', { performers: [] })
		).toEqual([]);
	});

	it('ignores unsupported markup', () => {
		expect(checkRule(rule, '[Verse: A]\n<u>Unknown voice</u>', { performers: ['A', 'B'] })).toEqual(
			[]
		);
	});
});
