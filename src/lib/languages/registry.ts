import { arabicLanguagePack } from './ar.js';
import { germanLanguagePack } from './de.js';
import { englishLanguagePack } from './en.js';
import { spanishLanguagePack } from './es.js';
import { frenchLanguagePack } from './fr.js';
import { languageSourceInventory } from './inventory.js';
import { japaneseLanguagePack } from './ja.js';
import { koreanLanguagePack } from './ko.js';
import { norwegianLanguagePack } from './no.js';
import type { LanguagePack } from './types.js';

const reviewedPacks = new Map<string, LanguagePack>([
	[englishLanguagePack.tag, englishLanguagePack],
	[norwegianLanguagePack.tag, norwegianLanguagePack],
	[arabicLanguagePack.tag, arabicLanguagePack],
	[germanLanguagePack.tag, germanLanguagePack],
	[spanishLanguagePack.tag, spanishLanguagePack],
	[frenchLanguagePack.tag, frenchLanguagePack],
	[japaneseLanguagePack.tag, japaneseLanguagePack],
	[koreanLanguagePack.tag, koreanLanguagePack]
]);

const inventoryByTag = new Map(languageSourceInventory.map((entry) => [entry.tag, entry]));

function baseTag(tag: string): string {
	return tag.trim().toLowerCase().replaceAll('_', '-').split('-')[0] ?? 'und';
}

/** Whether a BCP-47-like tag names English, including regional variants. */
export function isEnglishLanguage(tag: string): boolean {
	return /^en(?:-|$)/iu.test(tag.trim().replaceAll('_', '-'));
}

/** Resolve a BCP-47-like tag to the supported base tag, or `und` when unknown. */
export function resolveLanguageTag(tag: string): string {
	const normalized = baseTag(tag);
	return reviewedPacks.has(normalized) || inventoryByTag.has(normalized) ? normalized : 'und';
}

/** Return a reviewed language pack or a non-enforcing inventory/fallback pack. */
export function getLanguagePack(tag: string): LanguagePack {
	const resolved = resolveLanguageTag(tag);
	const reviewed = reviewedPacks.get(resolved);
	if (reviewed) {
		return reviewed;
	}

	const inventory = inventoryByTag.get(resolved);
	if (inventory) {
		return {
			tag: inventory.tag,
			displayName: inventory.language,
			policy: inventory.policy,
			headers: [],
			sourceIds: ['G-LANG-HEADERS'],
			reviewed: false
		};
	}

	return {
		tag: 'und',
		displayName: 'Unknown language',
		policy: 'unreviewed',
		headers: [],
		sourceIds: [],
		reviewed: false
	};
}

/** Normalized comparison key for a semantic section part: `Pre-Chorus` → `prechorus`. */
export function semanticPartKey(value: string): string {
	return value.toLocaleLowerCase().replaceAll(/[\s_-]+/gu, '');
}

export function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesHeaderTerm(header: string, term: string, pack: LanguagePack): boolean {
	const normalizedHeader = header.trim().toLocaleLowerCase(pack.tag);
	const normalizedTerm = term.trim().toLocaleLowerCase(pack.tag);
	return (
		normalizedHeader === normalizedTerm ||
		new RegExp(`^${escapeRegExp(normalizedTerm)}\\s+\\d+$`, 'u').test(normalizedHeader)
	);
}

/**
 * Which semantic part a header name spells in this language, ignoring its ordinal.
 *
 * One answer for every surface that asks: the section picker's ordering, and the
 * chorus linking that has to decide whether two headers are the same kind. Two
 * spellings of "is this a chorus" would disagree the first time a pack gained a
 * term.
 */
export function headerSemanticKey(
	pack: LanguagePack,
	header: string | undefined
): string | undefined {
	if (!header) {
		return undefined;
	}
	const vocabulary = pack.headers.find((candidate) =>
		candidate.terms.some((term) => matchesHeaderTerm(header, term, pack))
	);
	return vocabulary ? semanticPartKey(vocabulary.semanticPart) : undefined;
}

/**
 * The section kinds a song repeats verbatim, and therefore the only ones worth
 * linking.
 *
 * A verse repeats its *shape*, not its words, so linking two of them would be a
 * standing offer to overwrite one with the other. These three are the parts a
 * transcriber genuinely types twice, and mis-typing the second is the mistake
 * linking exists to make impossible.
 */
const LINKABLE_SEMANTICS = new Set(['chorus', 'prechorus', 'postchorus']);

/**
 * The linkable kind this header spells, in the draft's own language.
 *
 * English is consulted second rather than instead: Genius pages in every
 * language carry English headers routinely — `ja` is an English pack outright,
 * and `no` lists `Chorus` beside `Refreng` — so a German draft with `[Chorus]`
 * in it links exactly like one with `[Hook]`. The selected pack still wins,
 * which is what keeps `Refrain` reading as a chorus in French and as a chorus
 * in German rather than as English's separate `Refrain`.
 *
 * It sits here beside `headerSemanticKey` rather than in the editor because two
 * things now ask it and neither may own it: the linking extension, and the rule
 * that suggests linking. A rule may not import the editor.
 */
export function linkableSemantic(
	pack: LanguagePack | undefined,
	headerName: string | undefined
): string | undefined {
	const semantic =
		(pack ? headerSemanticKey(pack, headerName) : undefined) ??
		headerSemanticKey(englishLanguagePack, headerName);
	return semantic && LINKABLE_SEMANTICS.has(semantic) ? semantic : undefined;
}

/** Only human-reviewed localized vocabularies may produce header-language diagnostics. */
export function canLintHeaderLanguage(pack: LanguagePack): boolean {
	return pack.reviewed && pack.policy !== 'unreviewed' && pack.headers.length > 0;
}

export const reviewedLanguagePacks: readonly LanguagePack[] = [
	englishLanguagePack,
	norwegianLanguagePack,
	arabicLanguagePack,
	germanLanguagePack,
	spanishLanguagePack,
	frenchLanguagePack,
	japaneseLanguagePack,
	koreanLanguagePack
];
