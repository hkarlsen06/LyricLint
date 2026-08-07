import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { sectionDeprecatedHookRule as rule } from './section-deprecated-hook.js';
import { sectionLocalizedHeaderPreferenceRule } from './section-localized-header-preference.js';

describe('section.deprecated-hook', () => {
	it('marks Hook and offers both reviewed replacements', () => {
		const text = '[Hook: Avery]\nSing it';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['Hook']);
		expect(finding).toMatchObject({
			message: 'The [Hook] section name is deprecated.',
			fixes: [
				{ kind: 'preview', label: 'Replace with Chorus', edit: { baseRevision: testRevision } },
				{ kind: 'preview', label: 'Replace with Refrain', edit: { baseRevision: testRevision } }
			]
		});
		expect(finding?.fixes?.map((fix) => applyEdits(text, fix.edit.edits))).toEqual([
			'[Chorus: Avery]\nSing it',
			'[Refrain: Avery]\nSing it'
		]);
	});

	it('matches case-insensitively while preserving the exact marked text', () => {
		const text = '[hook]\nSing it';
		expect(markedText(text, checkRule(rule, text))).toEqual(['hook']);
	});

	it('uses the selected language pack canonical names without duplicate fixes', () => {
		const text = '[Hook: Ane]\nSyng det';
		const [finding] = checkRule(rule, text, { language: 'no' });

		expect(finding).toMatchObject({
			explanation:
				'The current Genius section guide replaces [Hook] with [Refreng]. This replacement uses the canonical name from the selected Norwegian language pack.',
			fixes: [
				{
					kind: 'preview',
					label: 'Replace with Refreng',
					edit: { baseRevision: testRevision }
				}
			],
			sourceIds: ['G-SECTION-HOOK', 'G-LANG-NO']
		});
		const fixed = applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? []);
		expect(fixed).toBe('[Refreng: Ane]\nSyng det');
		expect(checkRule(sectionLocalizedHeaderPreferenceRule, fixed, { language: 'no' })).toEqual([]);
	});

	it('keeps distinct canonical alternatives from localized packs', () => {
		const text = '[Hook]\nCanta';
		const [finding] = checkRule(rule, text, { language: 'es' });

		expect(finding?.fixes?.map((fix) => fix.label)).toEqual([
			'Replace with Coro',
			'Replace with Refrán'
		]);
		expect(finding?.fixes?.map((fix) => applyEdits(text, fix.edit.edits))).toEqual([
			'[Coro]\nCanta',
			'[Refrán]\nCanta'
		]);
	});

	it('accepts current English terms and languages whose reviewed pack includes Hook', () => {
		expect(checkRule(rule, '[Chorus]\nSing it')).toEqual([]);
		expect(checkRule(rule, '[Hook]\nText', { language: 'de' })).toEqual([]);
		expect(
			checkRule(rule, '[Hook]\nWords', { language: 'xx-ZZ' })[0]?.fixes?.map((fix) => fix.label)
		).toEqual(['Replace with Chorus', 'Replace with Refrain']);
	});
});
