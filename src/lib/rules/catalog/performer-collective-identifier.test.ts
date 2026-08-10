import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { performerCollectiveIdentifierRule as rule } from './performer-collective-identifier.js';

describe('performer.collective-identifier', () => {
	it('flags a styled Both slot and writes out the named performers', () => {
		const text = '[Chorus: Mein, <i>KrissyB</i> & <b>Both</b>]\nLine';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['Both']);
		expect(finding).toMatchObject({
			message: 'Write out the artist names instead of “Both”.',
			fixes: [
				{
					kind: 'preview',
					label: 'Replace with Mein & KrissyB',
					edit: { baseRevision: testRevision }
				}
			]
		});
		// The serial ampersand becomes a comma: with a joint group in the legend,
		// groups are comma-separated and ampersands mean unison.
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Chorus: Mein, <i>KrissyB</i>, <b>Mein & KrissyB</b>]\nLine'
		);
	});

	it('expands All to every named performer under the selected language', () => {
		const text = '[Refreng: Mein, <i>KrissyB</i> & <b>Alle</b>]\nLinje';
		const [finding] = checkRule(rule, text, { language: 'no' });

		expect(markedText(text, [finding!])).toEqual(['Alle']);
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Refreng: Mein, <i>KrissyB</i>, <b>Mein & KrissyB</b>]\nLinje'
		);
	});

	it('consults English alongside the selected language', () => {
		const text = '[Refreng: Mein, <i>KrissyB</i> & <b>Both</b>]\nLinje';
		const [finding] = checkRule(rule, text, { language: 'no' });
		expect(markedText(text, [finding!])).toEqual(['Both']);
	});

	it('rewrites a plain shared style run around the identifier', () => {
		const text = '[Chorus: A, B & Both]\nLine';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['Both']);
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Chorus: A, B, A & B]\nLine'
		);
	});

	it('falls back to the roster when the identifier is the whole legend', () => {
		const text = '[Chorus: All]\nLine';
		const [finding] = checkRule(rule, text, { performers: ['Avery', 'Blair', 'Cameron'] });

		expect(markedText(text, [finding!])).toEqual(['All']);
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Chorus: Avery & Blair & Cameron]\nLine'
		);
	});

	it('still flags, without a fix, when the expansion is not derivable', () => {
		const [finding] = checkRule(rule, '[Chorus: Both]\nLine');
		expect(finding?.fixes).toBeUndefined();

		// Both with three candidates is ambiguous about which two it means.
		const [threeWay] = checkRule(
			rule,
			'[Chorus: A, <i>B</i>, <b>C</b> & <i><b>Both</b></i>]\nLine'
		);
		expect(threeWay?.fixes).toBeUndefined();
	});

	it('leaves real names and roster performers alone', () => {
		expect(checkRule(rule, '[Chorus: All Time Low]\nLine')).toEqual([]);
		expect(
			checkRule(rule, '[Refreng: Alle]\nLinje', { language: 'no', performers: ['Alle'] })
		).toEqual([]);
		expect(checkRule(rule, '[Chorus: Mein, <i>KrissyB</i> & <b>Mein & KrissyB</b>]\nLine')).toEqual(
			[]
		);
	});
});
