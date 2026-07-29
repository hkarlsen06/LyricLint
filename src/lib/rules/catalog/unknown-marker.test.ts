import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '../rule-test-utils.js';
import {
	unknownImprovisedMarkerRule,
	unknownMarkerRule,
	unknownUnresolvedRule
} from './unknown-marker.js';

describe('unknown.improvised-marker', () => {
	it.each([
		['a run between words', 'I heard ??? tonight', '???'],
		['a run at the end of a line', 'I heard ???', '???'],
		['two question marks', 'I heard ?? tonight', '??'],
		['a long run', 'I heard ????? tonight', '?????'],
		['a run before punctuation', 'I heard ???, then nothing', '???']
	])('flags %s', (_label, lyric, marker) => {
		const input = `[Verse]\n${lyric}`;
		const diagnostics = checkRule(unknownImprovisedMarkerRule, input);

		expect(markedText(input, diagnostics)).toEqual([marker]);
		expect(applyRuleFixes(unknownImprovisedMarkerRule, input)).toBe(
			`[Verse]\n${lyric.replace(marker, '[?]')}`
		);
	});

	// A placeholder stands where words would stand; emphatic punctuation attaches
	// to the word it punctuates. That boundary is the whole rule, so both sides of
	// it are pinned.
	it.each([
		['emphatic punctuation on a word', 'Are you serious???'],
		['a single question mark', 'Was that you?'],
		['a spaced-out single mark', 'I heard ? tonight'],
		['the correct marker', 'I heard [?] tonight'],
		['a run inside an alphanumeric token', 'track2?? now']
	])('leaves %s alone', (_label, lyric) => {
		expect(checkRule(unknownImprovisedMarkerRule, `[Verse]\n${lyric}`)).toHaveLength(0);
	});

	// The recognized forms belong to `unknown.marker`, which offers a safe fix for
	// them. Two rules reporting one span would be two cards arguing about it, so
	// this one reads the other's own predicate rather than a second copy of it.
	it.each([
		['a parenthesized marker', 'I heard (??) tonight'],
		['a spaced parenthesized marker', 'I heard ( ?? ) tonight'],
		['an over-long bracketed marker', 'I heard [???] tonight']
	])('yields %s to unknown.marker', (_label, lyric) => {
		const input = `[Verse]\n${lyric}`;
		expect(checkRule(unknownImprovisedMarkerRule, input)).toHaveLength(0);
		expect(checkRule(unknownMarkerRule, input)).toHaveLength(1);
	});

	// The fix is `preview`, not `safe`: unlike `(?)` this is not a form anybody
	// recognizes, so nothing here may be swept up by a bulk fix.
	it('offers the replacement for review rather than mechanically', () => {
		const diagnostics = checkRule(unknownImprovisedMarkerRule, '[Verse]\nI heard ??? tonight');

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].severity).toBe('suggestion');
		expect(diagnostics[0].fixes?.[0].kind).toBe('preview');
	});

	// Applying it hands the document to the rule that asks the transcriber to go
	// back and identify the line, which is the finding they actually want next.
	it('lands on a document unknown.unresolved then picks up', () => {
		const fixed = applyRuleFixes(unknownImprovisedMarkerRule, '[Verse]\nI heard ??? tonight');

		expect(fixed).toBe('[Verse]\nI heard [?] tonight');
		expect(checkRule(unknownImprovisedMarkerRule, fixed)).toHaveLength(0);
		expect(checkRule(unknownUnresolvedRule, fixed)).toHaveLength(1);
	});
});
