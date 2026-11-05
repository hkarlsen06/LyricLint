import { getLanguagePack } from './registry.js';
import { languageSourceInventory } from './inventory.js';
export const languages: readonly (readonly [string, string])[] = [
	['en', 'English'],
	['en-US', 'English (United States)'],
	['en-GB', 'English (United Kingdom)'],
	...languageSourceInventory
		.filter((entry) => entry.tag !== 'en')
		.map((entry) => [entry.tag, entry.language] as const)
];

export function languageName(tag: string): string {
	return (
		languages.find(([candidate]) => candidate === tag)?.[1] ??
		(getLanguagePack(tag).tag === 'und' ? tag : getLanguagePack(tag).displayName)
	);
}
