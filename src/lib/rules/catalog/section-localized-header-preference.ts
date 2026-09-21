import type { ParsedDocument, RuleDefinition } from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';

interface LocalizedHeaderPreference {
	replacement: string;
	withChorusAffixes?: string;
	languageName: string;
	appliesWhen?: string;
}

export const norwegianPreferences = new Map<string, LocalizedHeaderPreference>([
	[
		'chorus',
		{
			replacement: 'Refreng',
			languageName: 'Norwegian',
			appliesWhen: 'Without Pre-Chorus or Post-Chorus sections.'
		}
	],
	[
		'omkved',
		{
			replacement: 'Refreng',
			withChorusAffixes: 'Chorus',
			languageName: 'Norwegian',
			appliesWhen: 'Use Chorus with Pre-Chorus or Post-Chorus sections; otherwise Refreng.'
		}
	],
	[
		'refreng',
		{
			replacement: 'Chorus',
			languageName: 'Norwegian',
			appliesWhen: 'With Pre-Chorus or Post-Chorus sections.'
		}
	],
	...['prerefreng', 'pre-refreng', 'førrefreng', 'før-refreng'].map(
		(name): [string, LocalizedHeaderPreference] => [
			name,
			{ replacement: 'Pre-Chorus', languageName: 'Norwegian' }
		]
	),
	...['postrefreng', 'post-refreng', 'etter-refreng', 'etterrefreng'].map(
		(name): [string, LocalizedHeaderPreference] => [
			name,
			{ replacement: 'Post-Chorus', languageName: 'Norwegian' }
		]
	),
	['bridge', { replacement: 'Bro', languageName: 'Norwegian' }],
	['avslutning', { replacement: 'Outro', languageName: 'Norwegian' }],
	['apning', { replacement: 'Intro', languageName: 'Norwegian' }],
	['interlude', { replacement: 'Mellomspill', languageName: 'Norwegian' }]
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

export function hasChorusAffixes(document: ParsedDocument): boolean {
	return document.sections.some(({ header }) => {
		if (!header) return false;
		const key = preferenceKey(header.namePart);
		const replacement = norwegianPreferences.get(key)?.replacement ?? key;
		return /^(pre|post)-chorus$/i.test(replacement);
	});
}

export function localizedHeaderPreference(
	language: string,
	headerName: string,
	withChorusAffixes = false
): LocalizedHeaderPreference | undefined {
	if (language !== 'no') {
		return undefined;
	}
	const key = preferenceKey(headerName);
	if ((key === 'refreng' && !withChorusAffixes) || (key === 'chorus' && withChorusAffixes))
		return undefined;
	const exact = norwegianPreferences.get(key);
	if (exact)
		return withChorusAffixes && exact.withChorusAffixes
			? { ...exact, replacement: exact.withChorusAffixes }
			: exact;
	for (const [expected, preference] of norwegianPreferences) {
		if (expected !== 'chorus' && expected !== 'bridge') continue;
		if (isAdjacentTransposition(key, expected)) {
			return expected === 'chorus' && withChorusAffixes
				? { replacement: 'Chorus', languageName: 'Norwegian' }
				: preference;
		}
	}
	return undefined;
}

export const sectionLocalizedHeaderPreferenceRule: RuleDefinition = {
	id: 'section.localized-header-preference',
	version: 4,
	settlesOn: 'document',
	defaultSeverity: 'suggestion',
	fixability: 'safe',
	sourceIds: ['G-LANG-PURPOSE', 'G-LANG-NO', 'G-NO-CHORUS'],
	check(document, context) {
		const withChorusAffixes = hasChorusAffixes(document);
		return document.sections.flatMap((section) => {
			const header = section.header;
			const preference = header
				? localizedHeaderPreference(context.language, header.namePart, withChorusAffixes)
				: undefined;
			if (!header || !preference) {
				return [];
			}
			const chorusFamily = ['Chorus', 'Refreng', 'Pre-Chorus', 'Post-Chorus'].includes(
				preference.replacement
			);

			return [
				diagnostic(
					this,
					header.nameRange,
					`Use the reviewed ${preference.languageName} header “${preference.replacement}” instead of “${header.namePart}”.`,
					chorusFamily
						? 'The Norwegian community convention uses Chorus when the song has Pre-Chorus or Post-Chorus sections, and Refreng otherwise. Keep Pre-Chorus and Post-Chorus untranslated.'
						: `The reviewed ${preference.languageName} header for this song part is “${preference.replacement}”. LyricLint recognizes “${header.namePart}” as an alternate name and suggests the catalog spelling.`,
					[
						replacementFix(
							context,
							'safe',
							`Use ${preference.replacement}`,
							header.nameRange,
							preference.replacement
						)
					],
					chorusFamily ? ['G-NO-CHORUS'] : ['G-LANG-PURPOSE', 'G-LANG-NO']
				)
			];
		});
	}
};
