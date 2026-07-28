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

	// Widening this rule to every repeat went one step too far: two copies with
	// completely different words share nothing, so linking them would tie no text
	// together at all — every word a difference, the mirror unable to carry
	// anything, and the finding an offer to do nothing.
	it('says nothing where the copies have nothing in common', () => {
		expect(
			findings(
				'[Pre-Chorus]\nJeg vet ikke hva du mener\nMen jeg blir her\n\n[Verse 1]\nA lyric\n\n[Pre-Chorus 2]\nAlt du sier er sant\nOg jeg drar nå'
			)
		).toEqual([]);
	});

	// And a copy that repeats another in full and then carries on is still worth
	// linking: the short one is wholly inside the long one, which is the case
	// linking is for. Measured against the shorter copy for exactly this.
	it('offers a link where one copy contains the other and goes on', () => {
		expect(
			findings(
				'[Chorus]\nHold the line\nAnd wait for me\n\n[Verse 1]\nA lyric\n\n[Chorus 2]\nHold the line\nAnd wait for me\nUntil the morning comes'
			)
		).toEqual(['[Chorus]']);
	});

	// This is the case the rule used to go quiet on, and going quiet on it was the
	// whole complaint: two choruses that differ are still two choruses worth
	// linking, and linking now keeps what they disagree on rather than overwriting
	// it. There is no wording left for the suggestion to endanger.
	it('offers a link where the repeats differ, because linking keeps the difference', () => {
		// Differing in *part*, which is the shape the whole feature is for. Two
		// copies with nothing in common are a different case and are left alone.
		const text =
			'[Chorus]\nHold the line\nAnd wait for me\n\n[Verse 1]\nA lyric\n\n[Chorus]\nHold the line\nAnd wait for now';
		const found = checkRule(sectionUnlinkedRepeatRule, text);

		expect(markedText(text, found)).toEqual(['[Chorus]']);
		expect(found[0]?.explanation).toContain('kept exactly as they are');
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
		expect(found[0]?.relatedRanges?.map(({ from, to }) => text.slice(from, to))).toEqual([
			'[Chorus 2]',
			'[Chorus 3]'
		]);
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

	// The common shape: a chorus that departs in the middle and comes back at the
	// end. All three are in the offer now — the odd one out is a copy with a
	// difference to keep, not a copy to be left out — and the finding says how
	// many of them the user still has to reconcile.
	it('counts the copy that departs rather than leaving it out', () => {
		const text =
			'[Chorus]\nHold the line\n\n[Verse 1]\nA\n\n[Chorus 2]\nLet it go\n\n[Verse 2]\nB\n\n[Chorus 3]\nHold the line';
		const found = checkRule(sectionUnlinkedRepeatRule, text);

		expect(markedText(text, found)).toEqual(['[Chorus]']);
		expect(found[0]?.explanation).toContain('appears 3 times');
		expect(found[0]?.explanation).toContain('1 of the copies are sung a little differently');
		expect(found[0]?.relatedRanges?.map(({ from, to }) => text.slice(from, to))).toEqual([
			'[Chorus 2]',
			'[Chorus 3]'
		]);
	});

	// The anchor is simply the first copy with words in it. It no longer has to be
	// the most-repeated wording, because the picker no longer overwrites from it —
	// it only decides which wording wins where the user asks for one.
	it('anchors on the first copy that has words, wherever it sits', () => {
		const text =
			'[Chorus]\nLet it go\n\n[Verse 1]\nA\n\n[Chorus 2]\nHold the line\n\n[Verse 2]\nB\n\n[Chorus 3]\nHold the line';

		expect(markedText(text, checkRule(sectionUnlinkedRepeatRule, text))).toEqual(['[Chorus]']);
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
