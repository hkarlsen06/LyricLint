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

const nativeNames = new Map<string, string>();

function nativeLanguageName(tag: string): string {
	const cached = nativeNames.get(tag);
	if (cached !== undefined) return cached;
	const name = languages.some(([candidate]) => candidate === tag)
		? (new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? '')
		: '';
	nativeNames.set(tag, name);
	return name;
}

function normalize(value: string): string {
	return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

export function filterLanguages(options: typeof languages, query: string): typeof languages {
	const needle = normalize(query);
	if (!needle) return options;
	return options.filter(([tag, name]) =>
		normalize(`${name} ${tag} ${nativeLanguageName(tag)}`).includes(needle)
	);
}
