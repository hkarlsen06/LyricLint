import { getLanguagePack, linkableSemantic } from '$lib/languages/registry.js';
import type { Diagnostic, ParsedDocument, RuleDefinition, Section } from '$lib/core/types.js';
import { isImmediateRepeat } from './section-immediate-repeat-spacing.js';
import { diagnostic } from './utils.js';

/** A section's lyrics as one comparable string. Markup and spacing are the words. */
function bodyText(section: Section): string {
	return section.lines
		.map((line) => line.text.trim())
		.filter((line) => line.length > 0)
		.join('\n');
}

/**
 * The copies of one song part that already say the same thing, plus the ones
 * still waiting to.
 *
 * The most-repeated wording wins, and a copy sung differently is simply not in
 * the set — a song whose first and last chorus match while the middle one
 * departs is ordinary songwriting, and it is also two choruses worth linking.
 * An earlier version required the *whole* kind to match and went quiet on
 * exactly that song, which is the common shape rather than the edge case.
 *
 * Empty copies join whichever wording won, because an untyped `[Chorus 3]` is a
 * repeat waiting to be filled and linking is what fills it. Ties go to the
 * wording that comes first, which is insertion order here.
 */
function matchingRepeats(members: readonly Section[]): Section[] {
	const byBody = new Map<string, Section[]>();
	const empty: Section[] = [];
	for (const member of members) {
		const body = bodyText(member);
		if (body.length === 0) {
			empty.push(member);
			continue;
		}
		byBody.set(body, [...(byBody.get(body) ?? []), member]);
	}
	let written: Section[] = [];
	for (const sharing of byBody.values()) {
		if (sharing.length > written.length) {
			written = sharing;
		}
	}
	// Nothing is typed yet, so there is no wording for the empties to take.
	if (written.length === 0) {
		return [];
	}
	const set = [...written, ...empty].sort((left, right) => left.from - right.from);
	return set.length > 1 ? set : [];
}

/**
 * Every group of repeats worth offering to link, with the copy to link them
 * from.
 *
 * The safety property is about what this points *at*, not about the whole song
 * part: the set it names either already matches or is empty, so accepting the
 * suggestion overwrites nothing. What the user then ticks in the picker is the
 * picker's arbitration, and it says what it will replace before it runs.
 */
export function linkableRepeatGroups(
	document: ParsedDocument,
	language: string
): { source: Section; matching: Section[]; members: Section[] }[] {
	const pack = getLanguagePack(language);
	const kinds = new Map<string, Section[]>();
	for (const [index, section] of document.sections.entries()) {
		const semantic = linkableSemantic(pack, section.header?.rawNamePart);
		if (!section.header || !semantic) {
			continue;
		}
		// An exact repeat of the part immediately before it is
		// `section.immediate-repeat-spacing`'s finding: Genius wants those two
		// copies under one header, not two headers tied together. Only the pair
		// itself steps aside — the rest of the kind is still linkable, and the two
		// repairs touch different sections.
		if (isImmediateRepeat(document, index) || isImmediateRepeat(document, index + 1)) {
			continue;
		}
		kinds.set(semantic, [...(kinds.get(semantic) ?? []), section]);
	}

	const found: { source: Section; matching: Section[]; members: Section[] }[] = [];
	for (const members of kinds.values()) {
		const matching = matchingRepeats(members);
		// The source is a copy with words in it, never an empty one: the picker
		// links *from* the section it was opened on, so anchoring this finding on
		// an empty `[Chorus 2]` would offer to overwrite the real chorus with
		// nothing. `matching` is in document order, so the first of it can be the
		// empty one; the wording's own first copy cannot.
		const source = matching.find((member) => bodyText(member).length > 0);
		if (source) {
			found.push({ source, matching, members });
		}
	}
	return found;
}

export const sectionUnlinkedRepeatRule: RuleDefinition = {
	id: 'section.unlinked-repeat',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'none',
	sourceIds: ['G-SECTIONS', 'G-REPEATS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (const { source, matching, members } of linkableRepeatGroups(document, context.language)) {
			if (!source.header) {
				continue;
			}
			// Which copies are meant, when they are not all of them. A finding that
			// said "3 times" about a song where only two match would send the reader
			// looking for a third that is deliberately different.
			const scope =
				matching.length === members.length
					? `This song part appears ${members.length} times, and every copy either already matches the others or is still empty.`
					: `${matching.length} of this song part's ${members.length} copies say the same thing, or are still empty; the rest are sung differently and are left alone.`;
			diagnostics.push(
				diagnostic(
					this,
					{ from: source.header.from, to: source.header.to },
					'Link the matching sections so one correction reaches them all.',
					`${scope} Linking ties them together so that editing one edits the rest, and a correction can never land in only one copy. Nothing here is overwritten: linking is offered only where the copies already agree.`
				)
			);
		}
		return diagnostics;
	}
};
