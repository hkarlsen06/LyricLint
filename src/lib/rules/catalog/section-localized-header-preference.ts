import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';

export interface LocalizedHeaderPreference {
	replacement: string;
	languageName: string;
}

export const norwegianPreferences = new Map<string, LocalizedHeaderPreference>([
	['chorus', { replacement: 'Refreng', languageName: 'Norwegian' }],
	['bridge', { replacement: 'Bro', languageName: 'Norwegian' }]
]);

function preferenceKey(headerName: string): string {
	return headerName
		.trim()
		.normalize('NFD')
		.replaceAll(/\p{M}+/gu, '')
		.toLocaleLowerCase('no');
}

function isAdjacentTransposition(value: string, expected: string): boolean {
	if (value.length !== expected.length) return false;
	const differing: number[] = [];
	for (let index = 0; index < value.length; index += 1) {
		if (value[index] !== expected[index]) differing.push(index);
	}
	if (differing.length !== 2) return false;
	const [first, second] = differing;
	return (
		second === first + 1 && value[first] === expected[second] && value[second] === expected[first]
	);
}

export function localizedHeaderPreference(
	language: string,
	headerName: string
): LocalizedHeaderPreference | undefined {
	if (language !== 'no') {
		return undefined;
	}
	const key = preferenceKey(headerName);
	const exact = norwegianPreferences.get(key);
	if (exact) return exact;
	for (const [expected, preference] of norwegianPreferences) {
		if (isAdjacentTransposition(key, expected)) return preference;
	}
	return undefined;
}

export const sectionLocalizedHeaderPreferenceRule: RuleDefinition = {
	id: 'section.localized-header-preference',
	version: 2,
	defaultSeverity: 'suggestion',
	fixability: 'safe',
	sourceIds: ['G-LANG-PURPOSE', 'G-LANG-NO'],
	check(document, context) {
		return document.sections.flatMap((section) => {
			const header = section.header;
			const preference = header
				? localizedHeaderPreference(context.language, header.namePart)
				: undefined;
			if (!header || !preference) {
				return [];
			}

			return [
				diagnostic(
					this,
					header.nameRange,
					`Use the reviewed ${preference.languageName} header “${preference.replacement}” instead of “${header.namePart}”.`,
					`The Genius international section-header source recognizes “${preference.replacement}” as the ${preference.languageName} term for “${header.namePart}”. Using the reviewed header keeps the transcription aligned with the selected language pack.`,
					[
						replacementFix(
							context,
							'safe',
							`Use ${preference.replacement}`,
							header.nameRange,
							preference.replacement
						)
					]
				)
			];
		});
	}
};
