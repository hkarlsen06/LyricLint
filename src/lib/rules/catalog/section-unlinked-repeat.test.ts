import { describe, expect, it } from 'vitest';
import { checkRule, markedText } from '../rule-test-utils.js';
import { sectionUnlinkedRepeatRule } from './section-unlinked-repeat.js';

function findings(text: string, language = 'en'): string[] {
	return markedText(text, checkRule(sectionUnlinkedRepeatRule, text, { language }));
}

describe('section.unlinked-repeat', () => {
	it('offers a link where two choruses are already the same words', () => {
		expect(
			findings('[Chorus]\nHold the line\n\n[Verse 1]\nA lyric\n\n[Chorus]\nHold the line')
		).toEqual(['[Chorus]']);
	});

	it('offers a link where a repeat is still empty', () => {
		expect(findings('[Chorus]\nHold the line\n\n[Verse 1]\nA lyric\n\n[Chorus 2]')).toEqual([
			'[Chorus]'
		]);
	});

	// The safety property: what the finding points at either already matches or
	// is empty, so accepting it overwrites nothing. Two copies that genuinely
	// differ are two copies with nothing to say about them.
	it('says nothing where the repeats are genuinely different', () => {
		expect(
			findings('[Chorus]\nHold the line\n\n[Verse 1]\nA lyric\n\n[Chorus]\nLet it go')
		).toEqual([]);
	});

	it('anchors on a section with words, never on the empty one it would overwrite', () => {
		expect(findings('[Chorus]\n\n[Verse 1]\nA lyric\n\n[Chorus 2]\nHold the line')).toEqual([
			'[Chorus 2]'
		]);
	});

	// `section.immediate-repeat-spacing` owns this one: Genius wants the two
	// copies under a single header, which is a different repair from tying two
	// headers together.
	it('leaves an immediate repeat to the rule that joins it', () => {
		expect(findings('[Chorus]\nHold the line\n\n[Chorus]\nHold the line')).toEqual([]);
	});

	it('never offers to link two verses, which repeat their shape and not their words', () => {
		expect(findings('[Verse 1]\nA lyric\n\n[Chorus]\nHold\n\n[Verse 2]\nA lyric')).toEqual([]);
	});

	it('reads the kind through the language pack, not the spelling', () => {
		expect(
			findings('[Refreng]\nHold linja\n\n[Vers 1]\nEn tekst\n\n[Chorus]\nHold linja', 'no')
		).toEqual(['[Refreng]']);
	});

	// One finding per group, not one per repeat. Three identical choruses are one
	// thing to say, and three cards saying it would be the panel repeating itself
	// down a column — and every one of them would open the same picker.
	it('says it once for a group of three, and counts them', () => {
		const text =
			'[Chorus]\nHold the line\n\n[Verse 1]\nA\n\n[Chorus 2]\nHold the line\n\n[Verse 2]\nB\n\n[Chorus 3]\nHold the line';
		const found = checkRule(sectionUnlinkedRepeatRule, text);

		expect(markedText(text, found)).toEqual(['[Chorus]']);
		expect(found[0]?.explanation).toContain('appears 3 times');
	});

	it('counts an empty repeat as one of them', () => {
		const text =
			'[Chorus]\nHold the line\n\n[Verse 1]\nA\n\n[Chorus 2]\nHold the line\n\n[Verse 2]\nB\n\n[Chorus 3]';
		const found = checkRule(sectionUnlinkedRepeatRule, text);

		expect(markedText(text, found)).toEqual(['[Chorus]']);
		expect(found[0]?.explanation).toContain('appears 3 times');
	});

	// The kinds are grouped separately, so a song that repeats all three says so
	// three times — one card per group, in document order.
	it('groups each kind on its own', () => {
		expect(
			findings(
				'[Pre-Chorus]\nRise\n\n[Chorus]\nHold\n\n[Post-Chorus]\nOoh\n\n[Verse]\nA\n\n[Pre-Chorus 2]\nRise\n\n[Chorus 2]\nHold\n\n[Post-Chorus 2]\nOoh'
			)
		).toEqual(['[Pre-Chorus]', '[Chorus]', '[Post-Chorus]']);
	});

	// The common shape: a chorus that departs in the middle of the song and comes
	// back at the end. One odd copy may not silence the two that match, and the
	// finding says which copies it means.
	it('offers the copies that match even where another one departs', () => {
		const text =
			'[Chorus]\nHold the line\n\n[Verse 1]\nA\n\n[Chorus 2]\nLet it go\n\n[Verse 2]\nB\n\n[Chorus 3]\nHold the line';
		const found = checkRule(sectionUnlinkedRepeatRule, text);

		expect(markedText(text, found)).toEqual(['[Chorus]']);
		expect(found[0]?.explanation).toContain("2 of this song part's 3 copies");
	});

	// The most-repeated wording wins, so the odd one out is the odd one out even
	// when it comes first.
	it('links the wording the song repeats, not the one it opens with', () => {
		const text =
			'[Chorus]\nLet it go\n\n[Verse 1]\nA\n\n[Chorus 2]\nHold the line\n\n[Verse 2]\nB\n\n[Chorus 3]\nHold the line';

		expect(markedText(text, checkRule(sectionUnlinkedRepeatRule, text))).toEqual(['[Chorus 2]']);
	});

	// Only the adjacent pair steps aside for `section.immediate-repeat-spacing`.
	// The other two choruses are still two copies worth linking, and the two
	// repairs touch different sections.
	it('sets aside an immediate repeat without silencing the rest of the kind', () => {
		const text =
			'[Chorus]\nHold\n\n[Chorus]\nHold\n\n[Verse]\nA\n\n[Chorus 3]\nHold\n\n[Verse 2]\nB\n\n[Chorus 4]\nHold';
		const found = checkRule(sectionUnlinkedRepeatRule, text);

		expect(markedText(text, found)).toEqual(['[Chorus 3]']);
		expect(found[0]?.explanation).toContain('appears 2 times');
	});

	it('needs more than one occurrence', () => {
		expect(findings('[Chorus]\nHold the line\n\n[Verse 1]\nA lyric')).toEqual([]);
	});

	it('offers no fix, because a link is not an edit the fix pipeline can carry', () => {
		const [diagnostic] = checkRule(
			sectionUnlinkedRepeatRule,
			'[Chorus]\nHold the line\n\n[Verse 1]\nA lyric\n\n[Chorus]\nHold the line'
		);
		expect(diagnostic?.fixes).toBeUndefined();
	});
});
