import { describe, expect, it } from 'vitest';
import { punctuationDroppedWordDashRule as rule } from './punctuation-dropped-word-dash.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('punctuation.dropped-word-dash', () => {
	it('covers the em dash and its comma together and offers a preview replacement', () => {
		const text = '[Verse]\nA word—, then silence';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['—,']);
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'preview',
			label: 'Remove the comma',
			edit: { baseRevision: testRevision }
		});
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\nA word— then silence');
	});

	it('reports every em-dash comma on a line', () => {
		const text = '[Verse]\nword—, and more—, yes';
		expect(markedText(text, checkRule(rule, text))).toEqual(['—,', '—,']);
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\nword— and more— yes');
	});

	it('reads a double hyphen only when it follows a letter and ends the word', () => {
		expect(markedText('[Verse]\nA word--', checkRule(rule, '[Verse]\nA word--'))).toEqual(['--']);
		expect(markedText('[Verse]\nA word-- then', checkRule(rule, '[Verse]\nA word-- then'))).toEqual(
			['--']
		);
		expect(checkRule(rule, '[Verse]\nA well--being note')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n--start')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n5--')).toEqual([]);
	});

	it('applies the letter boundary to any script', () => {
		const arabic = '[Verse]\nكلمة--';
		expect(fixInserts(checkRule(rule, arabic))).toEqual(['—']);

		const arabicComma = '[Verse]\nكلمة—, ثم';
		expect(markedText(arabicComma, checkRule(rule, arabicComma))).toEqual(['—,']);
	});

	it('ignores a dash that is not an em dash or a doubled hyphen', () => {
		expect(checkRule(rule, '[Verse]\nword–, en dash')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nword-, single hyphen')).toEqual([]);
	});

	it('groups the two patterns rather than interleaving them by offset', () => {
		// The engine sorts diagnostics globally, so the per-rule grouping here is
		// only what a direct `check` call returns.
		const text = '[Verse]\nword-- and more—, yes';
		expect(markedText(text, checkRule(rule, text))).toEqual(['—,', '--']);
	});

	it('reads inside supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Verse]\n<i>A word—,</i> tail';
		expect(markedText(supported, checkRule(rule, supported))).toEqual(['—,']);
		expect(checkRule(rule, '[Verse]\n<u>A word—,</u> tail')).toEqual([]);
		expect(checkRule(rule, '[Verse--]\nGo now')).toEqual([]);
	});

	it('reports each affected line separately', () => {
		const text = '[Verse]\nword--\nnext--';
		expect(markedText(text, checkRule(rule, text))).toEqual(['--', '--']);
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\nword—\nnext—');
	});
});
