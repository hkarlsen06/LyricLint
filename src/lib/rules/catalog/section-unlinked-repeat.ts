import { getLanguagePack, linkableSemantic } from '$lib/languages/registry.js';
import {
	bodiesAreSimilarEnoughToLink,
	comparableSectionBody,
	MAX_LINK_DISCOVERY_TOKENS
} from '$lib/core/link-shape.js';
import type { Diagnostic, ParsedDocument, RuleDefinition, Section } from '$lib/core/types.js';
import { isImmediateRepeat } from './section-immediate-repeat-spacing.js';
import { diagnostic } from './utils.js';

const GROUP_CACHE_LIMIT = 16;
const GROUP_CACHE_CHARACTERS = 262_144;
const MAX_CACHED_GROUP_CHARACTERS = 65_536;
const groupWorthCache = new Map<string, boolean>();
let retainedGroupCharacters = 0;
/**
 * Whether these copies have enough in common to be worth keeping in step.
 *
 * Linking stopped being destructive, so this rule was widened to point at every
 * repeat of a song part — which went one step too far. Two pre-choruses with
 * *completely different* words share nothing, so linking them ties no text
 * together at all: every word is a difference, the mirror can never carry an
 * edit, and the finding is an offer to do nothing.
 *
 * The alignment that answers this is the same `alignPassages` the link itself is
 * built on, which is why it lives in `core` rather than beside the editor: a
 * rule may not import the editor, and two answers to "how alike are these" is
 * one more than the number that can stay in agreement.
 *
 * Empty copies are not counted, and do not count against. An untyped
 * `[Chorus 3]` shares nothing with anything by definition, and it is the case
 * this rule most wants to catch: a repeat waiting to be filled.
 */
function worthLinking(members: readonly Section[]): boolean {
	const bodies = members.map(comparableSectionBody).filter((body) => body.length > 0);
	// Re-parsing an edit in a verse creates new Section objects for unchanged
	// choruses too. Cache only their pure answer, never ranges or diagnostics.
	// Whole-group reuse also covers groups larger than the bounded pair cache.
	const characters = bodies.reduce((total, body) => total + body.length, 0);
	const key = characters <= MAX_CACHED_GROUP_CHARACTERS ? JSON.stringify(bodies) : undefined;
	if (key !== undefined) {
		const cached = groupWorthCache.get(key);
		if (cached !== undefined) return cached;
	}
	const worth = bodiesWorthLinking(bodies);
	if (key !== undefined && key.length <= MAX_CACHED_GROUP_CHARACTERS) {
		while (
			groupWorthCache.size >= GROUP_CACHE_LIMIT ||
			retainedGroupCharacters + key.length > GROUP_CACHE_CHARACTERS
		) {
			const oldest = groupWorthCache.keys().next().value;
			if (oldest === undefined) break;
			groupWorthCache.delete(oldest);
			retainedGroupCharacters -= oldest.length;
		}
		groupWorthCache.set(key, worth);
		retainedGroupCharacters += key.length;
	}
	return worth;
}

function bodiesWorthLinking(bodies: readonly string[]): boolean {
	if (bodies.length < 2) {
		// One copy with words and the rest still empty. Nothing to compare, and
		// filling them is the whole point.
		return bodies.length === 1;
	}
	// **Some pair**, not all of them together. A song whose first and last chorus
	// match while the middle one is sung differently shares almost nothing across
	// all three — and it is still two choruses worth linking. Asking of the whole
	// set is how this rule went quiet on that shape once already.
	for (let left = 0; left < bodies.length; left += 1) {
		for (let right = left + 1; right < bodies.length; right += 1) {
			if (sharesEnough(bodies[left] ?? '', bodies[right] ?? '')) {
				return true;
			}
		}
	}
	return false;
}

function sharesEnough(left: string, right: string): boolean {
	return bodiesAreSimilarEnoughToLink(left, right, { maxTokens: MAX_LINK_DISCOVERY_TOKENS });
}

/**
 * Every group of repeats worth offering to link, with the copy to link them
 * from.
 *
 * This used to name only the copies that *already agreed*, and at the time the
 * reason was sound: linking overwrote every copy from the one the picker was
 * opened on, so pointing at a chorus that genuinely differed was an invitation
 * to destroy the difference. Two rounds of narrowing went into keeping that
 * offer honest — first the whole song part had to match, then the
 * most-repeated wording had to.
 *
 * All of it is gone, because the hazard is. Linking now keeps every word the
 * copies disagree on and ties together the rest, so there is no wording left
 * for a suggestion to endanger — and the song this rule was quietest about is
 * exactly the one the whole rebuild was for: two choruses that differ by a line.
 * The narrowing was silence on the common case, bought against a risk that no
 * longer exists.
 *
 * So the song part *is* the group now. Which copies to tie together, and which
 * differences to keep, is the picker's question; it names every one of them
 * before anything runs.
 */
function linkableRepeatGroups(
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
		if (members.length < 2 || !worthLinking(members)) {
			continue;
		}
		// The source is a copy with words in it, never an empty one: the picker
		// resolves the wordings it has to from the section it was opened on, so
		// anchoring this finding on an empty `[Chorus 2]` would leave a copy the
		// user is filling with nowhere to take the words from.
		const source = members.find((member) => comparableSectionBody(member).length > 0);
		if (!source) {
			continue;
		}
		// Only so the finding can say how much of the work is already done. It
		// arbitrates nothing and no longer decides who is in the offer.
		const matching = members.filter(
			(member) =>
				comparableSectionBody(member) === comparableSectionBody(source) ||
				comparableSectionBody(member).length === 0
		);
		found.push({ source, matching, members });
	}
	return found;
}

export const sectionUnlinkedRepeatRule: RuleDefinition = {
	id: 'section.unlinked-repeat',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'none',
	sourceIds: ['G-SECTIONS', 'G-REPEATS'],
	// There is no repeat to point at until the second copy exists.
	settlesOn: 'document',
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (const { source, matching, members } of linkableRepeatGroups(document, context.language)) {
			if (!source.header) {
				continue;
			}
			// Each branch says only what applies to it: copies that already match
			// need no reassurance about differences, and copies that differ need
			// nothing else so much as that reassurance.
			const differing = members.length - matching.length;
			const explanation =
				matching.length === members.length
					? `This song part appears ${members.length} times, and every copy already matches or is still empty. Linked, editing one edits them all, so a correction can never land in just one copy.`
					: `This song part appears ${members.length} times, and ${differing} of the copies ${differing === 1 ? 'is' : 'are'} sung a little differently. Linking ties only the words they share — the differences are kept exactly as they are.`;
			diagnostics.push({
				...diagnostic(
					this,
					{ from: source.header.from, to: source.header.to },
					'Link these repeats so one correction reaches them all.',
					explanation
				),
				relatedRanges: members.flatMap((section) =>
					section.header && section.header !== source.header
						? [{ from: section.header.from, to: section.header.to }]
						: []
				)
			});
		}
		return diagnostics;
	}
};
