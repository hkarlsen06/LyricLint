import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import { insertSectionHeader } from '$lib/performers/transform.js';
import { applyEdits, checkRule, markedText } from '../rule-test-utils.js';
import { sectionHeaderEmptyRule as rule } from './section-header-empty.js';

function messages(text: string): string[] {
	return checkRule(rule, text).map((finding) => finding.message);
}

describe('section.header-empty', () => {
	it('reports brackets that name no song part', () => {
		expect(messages('[]\nA lyric')).toEqual(['This section header is empty.']);
		expect(messages('[ ]\nA lyric')).toEqual(['This section header is empty.']);
	});

	it('reports an empty header with nothing under it yet', () => {
		// The screen a first-timer meets: one line, two brackets, no lyrics.
		// Nothing about it is settled by waiting for a body that may never come.
		expect(messages('[]')).toEqual(['This section header is empty.']);
	});

	it('reports a header that names its voices and not its part', () => {
		expect(messages('[: Ari]\nA lyric')).toEqual(['This section header is empty.']);
	});

	it('marks the brackets, not a point between them', () => {
		const input = '[]\nA lyric';
		// `section.header-unrecognized` covered the empty name part, which is a
		// zero-width range — an underline that draws nothing over the one line the
		// card is about.
		expect(markedText(input, checkRule(rule, input))).toEqual(['[]']);
	});

	it('leaves a named header alone', () => {
		expect(messages('[Verse]\nA lyric')).toEqual([]);
		expect(messages('[Verse 1: Ari]\nA lyric')).toEqual([]);
		// An ordinal with no term is still a name somebody typed.
		expect(messages('[2]\nA lyric')).toEqual([]);
	});

	it('leaves an unclosed bracket to the rule that owns it', () => {
		// Half of typing `[Verse 1]` is spent in this state, and
		// `syntax.unbalanced-brackets` is already reporting it.
		expect(messages('[\nA lyric')).toEqual([]);
		expect(messages('[Verse\nA lyric')).toEqual([]);
	});

	it('says nothing about a lyric that merely contains brackets', () => {
		expect(messages('[Verse]\nA bracket [] in a lyric')).toEqual([]);
	});

	it('offers no text fix, because the name is the thing nobody has chosen', () => {
		expect(checkRule(rule, '[]\nA lyric')[0]?.fixes).toBeUndefined();
	});

	it('cites the header sources of the selected language', () => {
		expect(checkRule(rule, '[]\nA lyric', { language: 'no' })[0]?.sourceIds).toContain('G-LANG-NO');
	});

	// The card's one control is the picker, and the picker hands the diagnostic's
	// own `from` to the transform. A finding anchored anywhere but the section's
	// start is a `Choose header` press that announces a refusal.
	it('reports a range the header picker can act on', () => {
		const input = '[Verse]\nFirst\n\n[]\nSecond';
		const [finding] = checkRule(rule, input);
		const document = parseDocument(input);
		const result = insertSectionHeader({
			revision: 41,
			text: input,
			document,
			sectionFrom: finding?.from ?? -1,
			headerName: 'Chorus'
		});

		expect(result.status).toBe('applied');
		if (result.status === 'applied') {
			expect(applyEdits(input, result.edit.edits)).toBe('[Verse]\nFirst\n\n[Chorus]\nSecond');
		}
	});

	it('reports every empty header in the document', () => {
		expect(messages('[]\nA lyric\n\n[]\nAnother lyric')).toHaveLength(2);
	});
});
