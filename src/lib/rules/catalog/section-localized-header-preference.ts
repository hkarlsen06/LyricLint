import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';

export interface LocalizedHeaderPreference {
	replacement: string;
	languageName: string;
}

const norwegianPreferences = new Map<string, LocalizedHeaderPreference>([
	['chorus', { replacement: 'Refreng', languageName: 'Norwegian' }],
	['bridge', { replacement: 'Bro', languageName: 'Norwegian' }]
]);

export function localizedHeaderPreference(
	language: string,
	headerName: string
): LocalizedHeaderPreference | undefined {
	if (language !== 'no') {
		return undefined;
	}
	return norwegianPreferences.get(headerName.trim().toLocaleLowerCase('no'));
}

export const sectionLocalizedHeaderPreferenceRule: RuleDefinition = {
	id: 'section.localized-header-preference',
	version: 1,
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
					`Prefer “${preference.replacement}” over “${header.namePart}” in ${preference.languageName} lyrics.`,
					`“${preference.replacement}” is the culturally localized ${preference.languageName} term for this section. Using it keeps the transcription linguistically consistent; this is a preference, not an error.`,
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
