import { beforeAll, describe, expect, it } from 'vitest';
import { loadStatisticalLanguageDetector } from '$lib/languages/detect.js';
import { checkRule, markedText } from '../rule-test-utils.js';
import { languageSelectionMismatchRule as rule } from './language-selection-mismatch.js';

beforeAll(() => loadStatisticalLanguageDetector());

describe('language.selection-mismatch', () => {
	it('reports the first visible lyric line with the detected language', () => {
		const text =
			'[Verse]\nJe regarde la lumière du matin\nEt je sais que tu resteras avec moi ce soir';
		const findings = checkRule(rule, text);

		expect(markedText(text, findings)).toEqual(['Je regarde la lumière du matin']);
		expect(findings[0]).toMatchObject({
			message: 'Lyrics appear to be French, but English is selected.',
			detectedLanguage: { tag: 'fr', displayName: 'French' }
		});
		expect(findings[0]?.fixes).toBeUndefined();
	});

	it('ignores markup when choosing the diagnostic range', () => {
		const text =
			'[Verse]\n  <i>Je regarde la lumière du matin</i>\nEt je sais que tu resteras avec moi ce soir';
		expect(markedText(text, checkRule(rule, text))).toEqual(['Je regarde la lumière du matin']);
	});

	it('accepts lyrics matching the selected language and inconclusive short lyrics', () => {
		expect(
			checkRule(
				rule,
				'[Verse]\nJe regarde la lumière du matin\nEt je sais que tu resteras avec moi ce soir',
				{ language: 'fr' }
			)
		).toEqual([]);
		expect(checkRule(rule, '[Verse]\nOh yeah')).toEqual([]);
	});
});
