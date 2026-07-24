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
