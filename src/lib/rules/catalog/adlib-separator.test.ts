import { describe, expect, it } from 'vitest';
import { adlibSeparatorRule as rule } from './adlib-separator.js';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';

/** The document with the diagnostic's chosen fix applied, on its own. */
function applyFix(text: string, index: number): string {
	const [finding] = checkRule(rule, text);
	return applyEdits(text, finding!.fixes![index]!.edit.edits);
}

describe('adlib.separator', () => {
	it('offers both a comma and a hyphen for a run of ad-libs', () => {
		const text = '[Verse]\n(Yeah yeah yeah)';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['Yeah yeah yeah']);
		expect(finding?.fixes).toMatchObject([
			{
				kind: 'preview',
				label: 'Separate as Yeah, yeah, yeah',
				edit: { baseRevision: testRevision }
			},
			{ kind: 'preview', label: 'Combine as Yeah-yeah-yeah' }
		]);
		expect(applyFix(text, 0)).toBe('[Verse]\n(Yeah, yeah, yeah)');
		expect(applyFix(text, 1)).toBe('[Verse]\n(Yeah-yeah-yeah)');
	});

	it('reads a run of different ad-libs, not only a repeat', () => {
		expect(applyFix('[Verse]\n(Uh huh)', 1)).toBe('[Verse]\n(Uh-huh)');
		expect(applyFix('[Verse]\n(Ooh yeah, I know)', 0)).toBe('[Verse]\n(Ooh, yeah, I know)');
		expect(applyFix('[Verse]\nHey oh woah, come on', 0)).toBe('[Verse]\nHey, oh, woah, come on');
	});

	it('reads a run outside parentheses and in any casing', () => {
		expect(applyFix('[Verse]\nna na na na baby', 1)).toBe('[Verse]\nna-na-na-na baby');
	});

	it('runs as long as the ad-libs do, with no cap on the count', () => {
		const text = '[Verse]\n(Yeah yeah yeah yeah ooh ooh hey woah na na na)';
		expect(markedText(text, checkRule(rule, text))).toEqual([
			'Yeah yeah yeah yeah ooh ooh hey woah na na na'
		]);
		expect(applyFix(text, 0)).toBe(
			'[Verse]\n(Yeah, yeah, yeah, yeah, ooh, ooh, hey, woah, na, na, na)'
		);
		expect(applyFix(text, 1)).toBe('[Verse]\n(Yeah-yeah-yeah-yeah-ooh-ooh-hey-woah-na-na-na)');
	});

	it('stops the run at the first word that is not an ad-lib', () => {
		const text = '[Verse]\nOoh ooh yeahs, I know';
		expect(markedText(text, checkRule(rule, text))).toEqual(['Ooh ooh']);
	});

	// Every line here was a live false positive before the weak/strong split:
	// `la`, `ha`, `da`, `na`, `ay` and `ye` are ordinary words in languages this
	// product accepts, so two of them in a row is a phrase rather than a chant.
	it('leaves two ordinary words that happen to be ad-libs alone', () => {
		const phrases: [string, string][] = [
			['es', 'La ha visto en el espejo'],
			['es', 'Se la da de valiente'],
			['es', 'Ella la ha dejado sola'],
			['no', 'Du kan ha da du vil'],
			['no', 'La ha det som det er'],
			['no', 'Vi var da da du kom'],
			['fr', 'Elle la ha jamais vue'],
			['en', 'I saw La La Land twice']
		];
		for (const [language, line] of phrases) {
			expect(checkRule(rule, `[Verse]\n${line}`, { language }), line).toEqual([]);
		}
	});

	it('reads the same pair as a chant once a third arrives', () => {
		// The cost of the rule above, stated: a two-word run of these is quiet.
		expect(checkRule(rule, '[Verse]\nHa ha, you thought')).toEqual([]);
		expect(
			markedText(
				'[Verse]\nHa ha ha, you thought',
				checkRule(rule, '[Verse]\nHa ha ha, you thought')
			)
		).toEqual(['Ha ha ha']);
		// A word that is an ad-lib and nothing else carries a pair on its own.
		expect(markedText('[Verse]\nMm mm', checkRule(rule, '[Verse]\nMm mm'))).toEqual(['Mm mm']);
		expect(markedText('[Verse]\n(Uh huh)', checkRule(rule, '[Verse]\n(Uh huh)'))).toEqual([
			'Uh huh'
		]);
	});

	it('leaves anything that is not a bare run of ad-libs alone', () => {
		// One ad-lib among ordinary words is `adlib.parentheses`'s business.
		expect(checkRule(rule, '[Verse]\nOh baby oh baby')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n(Yeah, yeah)')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n(Yeah-yeah yeah)')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nOohs oohs')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nI know I know')).toEqual([]);
		expect(checkRule(rule, '[Chorus: Na na]\nWords')).toEqual([]);
	});

	it('never joins across markup, which masks as whitespace', () => {
		expect(checkRule(rule, '[Verse]\n<i>Yeah</i> yeah')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<u>Yeah yeah</u>')).toEqual([]);
	});
});
