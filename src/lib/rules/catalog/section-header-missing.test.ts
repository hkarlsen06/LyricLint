import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { sectionHeaderMissingRule as rule } from './section-header-missing.js';

describe('section.header-missing', () => {
	it('anchors a first headerless section at the document start without guessing a fix', () => {
		const text = 'A lyric';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['']);
		expect(finding).toMatchObject({
			from: 0,
			to: 0,
			message: 'This lyric section has no header.'
		});
		expect(finding?.fixes).toBeUndefined();
	});

	it('offers to remove the blank line before a later headerless section', () => {
		const text = '[Verse]\nFirst line\n\nSecond stanza';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['']);
		expect(finding).toMatchObject({
			message: 'This lyric section has no header.',
			fixes: [
				{
					kind: 'preview',
					label: 'Remove blank line',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(finding?.relatedRanges?.map(({ from, to }) => text.slice(from, to))).toEqual(['\n']);
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Verse]\nFirst line\nSecond stanza'
		);
	});

	it('accepts headed, blank, prose-headed, and exact immediate-repeat sections', () => {
		expect(checkRule(rule, '[Verse]\nA lyric')).toEqual([]);
		expect(checkRule(rule, '   ')).toEqual([]);
		expect(checkRule(rule, 'Verse 1:\nA lyric')).toEqual([]);
		expect(checkRule(rule, '[Chorus]\nAgain\nTonight\n\nAgain\nTonight')).toEqual([]);
	});
});
