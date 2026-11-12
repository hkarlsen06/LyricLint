import { describe, expect, it } from 'vitest';
import type { TextEdit } from '#lib/core/types.js';
import { representationEdits } from './representation.js';

function apply(text: string, edits: TextEdit[]): string {
	return [...edits]
		.sort((a, b) => b.from - a.from)
		.reduce((value, edit) => value.slice(0, edit.from) + edit.insert + value.slice(edit.to), text);
}
const context = {
	profile: 'musixmatch',
	sourceProfile: 'genius',
	contentKind: 'original'
} as const;

describe('derived platform typography', () => {
	it.each([
		'What',
		'Whatever',
		'Which',
		'Whichever',
		'Who',
		'Whoever',
		'Whom',
		'Whomever',
		'Whose',
		'Where',
		'Wherever',
		'When',
		'Whenever',
		'Why',
		'How',
		'However'
	])('uses ordinary grammatical case for %s and keeps prior rendering versions pinned', (word) => {
		const text = `We sing (${word})`;
		const current = representationEdits(text, { ...context, language: 'en' });
		expect(apply(text, current)).toBe(`We sing (${word.toLowerCase()})`);
		for (const converterVersion of ['1', '2'] as const)
			expect(representationEdits(text, { ...context, language: 'en', converterVersion })).toEqual(
				[]
			);
		expect(
			representationEdits(`We sing (${word.toLowerCase()})`, { ...context, language: 'en' })
		).toEqual([]);
	});

	it.each([
		['fr', 'Tu reviens ?\r\nTu repars\u00a0?', 'Tu reviens?\r\nTu repars?'],
		['ja', '帰る?\nGo？！\nまた帰る!!', '帰る？\nGo?!\nまた帰る！！'],
		['ja', '🎵?\nCafe\u0301?\nｶﾅ？', '🎵?\nCafe\u0301?\nｶﾅ?']
	])(
		'derives only the reviewed marks for %s and reaches a fixed point',
		(language, text, expected) => {
			const first = representationEdits(text, { ...context, language });
			expect(apply(text, first)).toBe(expected);
			expect(representationEdits(expected, { ...context, language })).toEqual([]);
			expect(representationEdits(text, { ...context, language })).toEqual(first);
		}
	);

	it.each(['en', 'no', 'ar', 'de', 'es', 'ko'])('does not invent typography for %s', (language) => {
		expect(representationEdits('帰る? Tu reviens ? 12 Imma', { ...context, language })).toEqual([]);
	});

	it('preserves native authored wording, unknown markup and semantic decisions', () => {
		expect(
			representationEdits('Tu reviens ?', {
				...context,
				language: 'fr',
				sourceProfile: 'musixmatch'
			})
		).toEqual([]);
		expect(representationEdits('帰る?', { ...context, language: 'ja', profile: 'genius' })).toEqual(
			[]
		);
		expect(representationEdits('<unknown>帰る?</unknown>', { ...context, language: 'ja' })).toEqual(
			[]
		);
		expect(
			representationEdits('We sing.\nAt 6 o’clock\n(Aha)\nI hear ****', {
				...context,
				language: 'en'
			})
		).toEqual([]);
	});
});
