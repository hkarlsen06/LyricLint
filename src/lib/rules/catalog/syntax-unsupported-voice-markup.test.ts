import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { Diagnostic } from '$lib/core/types.js';
import { syntaxUnsupportedVoiceMarkupRule as rule } from './syntax-unsupported-voice-markup.js';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';

function fixEdits(finding: Diagnostic | undefined) {
	return finding?.fixes?.[0]?.edit.edits ?? [];
}

/** Apply one diagnostic's removal fix to the text it was reported against. */
function applyFix(text: string, finding: Diagnostic | undefined): string {
	return applyEdits(text, fixEdits(finding));
}

describe('syntax.unsupported-voice-markup', () => {
	it('offers one preview removal per reported fragment', () => {
		const text = '[Snowfall]\n<u>The north wind steals our names</u>';
		const found = checkRule(rule, text);

		expect(markedText(text, found)).toEqual(['<u>', '</u>']);
		expect(found.every((finding) => finding.fixes?.[0]?.kind === 'preview')).toBe(true);
		expect(found.every((finding) => finding.fixes?.[0]?.label === 'Remove markup')).toBe(true);
		expect(found.every((finding) => finding.fixes?.[0]?.edit.baseRevision === testRevision)).toBe(
			true
		);
	});

	it('removes an opening tag together with its closing tag', () => {
		const text = '[Snowfall]\n<u>The north wind steals our names</u>';
		const found = checkRule(rule, text);
		const cleaned = '[Snowfall]\nThe north wind steals our names';

		// Either end of the wrapper resolves the whole thing, so one confirmation
		// is enough no matter which diagnostic the user opened.
		expect(applyFix(text, found[0])).toBe(cleaned);
		expect(applyFix(text, found[1])).toBe(cleaned);
		expect(checkRule(rule, cleaned)).toEqual([]);
		expect(parseDocument(cleaned).syntaxIssues).toEqual([]);
	});

	it('keeps paired removals sorted and non-overlapping for one atomic edit', () => {
		const found = checkRule(rule, '[Verse]\n<u>Line</u>');
		const edits = fixEdits(found[1]);

		expect(edits).toHaveLength(2);
		expect(edits[0]!.from).toBeLessThan(edits[1]!.from);
		expect(edits[0]!.to).toBeLessThanOrEqual(edits[1]!.from);
		expect(edits.every((edit) => edit.insert === '')).toBe(true);
	});

	it('pairs the nearest matching tags and never crosses a section boundary', () => {
		const text = '[Verse]\n<u>First</u>\n\n[Chorus]\n<u>Second</u>';
		const found = checkRule(rule, text);

		expect(fixEdits(found[0]).map((edit) => text.slice(edit.from, edit.to))).toEqual([
			'<u>',
			'</u>'
		]);
		expect(applyFix(text, found[0])).toBe('[Verse]\nFirst\n\n[Chorus]\n<u>Second</u>');
		expect(applyFix(text, found[3])).toBe('[Verse]\n<u>First</u>\n\n[Chorus]\nSecond');
	});

	it('removes an unmatched tag on its own', () => {
		const text = '[Verse]\nBlair sings</i>';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['</i>']);
		expect(applyFix(text, finding)).toBe('[Verse]\nBlair sings');
	});

	it('removes only the tag of an unterminated fragment, not the lyric after it', () => {
		const text = '[Verse]\nBlair sings <i and the pines wake';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['<i and the pines wake']);
		expect(applyFix(text, finding)).toBe('[Verse]\nBlair sings  and the pines wake');
	});

	it('restores a supported wrapper by removing the unsupported markup inside it', () => {
		const text = '[Verse: Avery & <i>Blair</i>]\n<i>Blair <u>wakes</u> the pines</i>';
		const found = checkRule(rule, text);
		const cleaned = '[Verse: Avery & <i>Blair</i>]\n<i>Blair wakes the pines</i>';

		expect(markedText(text, found)).toEqual(['<i>', '<u>', '</u>', '</i>']);
		// The `<i>` wrapper only parses as malformed because of the `<u>` inside it,
		// so removing that pair makes the whole line supported again.
		expect(applyFix(text, found[1])).toBe(cleaned);
		expect(checkRule(rule, cleaned)).toEqual([]);
	});

	it('strips unsupported markup from a section legend', () => {
		const text = '[Verse: Avery & <u>Blair</u>]\nA line';
		const found = checkRule(rule, text);

		// Unsupported markup keeps the ampersand inside one candidate, so the group
		// covers the whole legend rather than the tagged name alone.
		expect(markedText(text, found)).toEqual(['Avery & <u>Blair</u>']);
		expect(applyFix(text, found[0])).toBe('[Verse: Avery & Blair]\nA line');
		expect(checkRule(rule, '[Verse: Avery & Blair]\nA line')).toEqual([]);
	});

	it('does not offer a legend removal that would empty the slot', () => {
		const [finding] = checkRule(rule, '[Verse: <u></u>]\nA line');

		expect(finding?.message).toBe('Unsupported performer markup in the section legend.');
		expect(finding?.fixes).toBeUndefined();
	});
});
