import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { sectionLocalizedHeaderPreferenceRule as rule } from './section-localized-header-preference.js';

describe('section.localized-header-preference', () => {
	it('replaces an English Norwegian header while preserving ordinal and legend', () => {
		const text = '[Chorus 2: Ane]\nEn natt';
		const [finding] = checkRule(rule, text, { language: 'no' });

		expect(markedText(text, [finding!])).toEqual(['Chorus']);
		expect(finding).toMatchObject({
			message: 'Use the reviewed Norwegian header “Refreng” instead of “Chorus”.',
			fixes: [
				{
					kind: 'safe',
					label: 'Use Refreng',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Refreng 2: Ane]\nEn natt'
		);
	});

	it('normalizes accents and an adjacent transposition to the sourced Bridge preference', () => {
		for (const header of ['Brídge', 'Brigde']) {
			const text = `[${header}]\nEn natt`;
			const [finding] = checkRule(rule, text, { language: 'no' });
			expect(markedText(text, [finding!])).toEqual([header]);
			expect(finding?.message).toBe(
				`Use the reviewed Norwegian header “Bro” instead of “${header}”.`
			);
			expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe('[Bro]\nEn natt');
		}
	});

	it('accepts localized headers and does not apply outside Norwegian', () => {
		expect(checkRule(rule, '[Bro]\nEn natt', { language: 'no' })).toEqual([]);
		expect(checkRule(rule, '[Bridge]\nA night', { language: 'en' })).toEqual([]);
	});
});
