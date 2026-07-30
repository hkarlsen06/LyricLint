import type { RuleDefinition } from '$lib/core/types.js';
import {
	canLintHeaderLanguage,
	getLanguagePack,
	reviewedLanguagePacks
} from '$lib/languages/registry.js';
import { headerNameIsEmpty } from '$lib/core/parser.js';
import { diagnostic } from './utils.js';

function isRecognizedHeader(name: string): boolean {
	const normalized = name.trim().toLocaleLowerCase();
	return reviewedLanguagePacks.some((pack) =>
		pack.headers.some((header) =>
			header.terms.some((term) => term.toLocaleLowerCase() === normalized)
		)
	);
}

function isNonEnglishTitleHeader(name: string, language: string, sectionIndex: number): boolean {
	const pack = getLanguagePack(language);
	return (
		sectionIndex === 0 && pack.tag !== 'en' && pack.tag !== 'und' && /["“][^"”]+["”]/u.test(name)
	);
}

function orderedSourceIds(language: string, sourceIds: readonly string[]): string[] {
	const selected = getLanguagePack(language);
	const selectedSourceIds = canLintHeaderLanguage(selected) ? selected.sourceIds : [];
	return [
		'G-SECTIONS',
		...selectedSourceIds,
		...sourceIds.filter(
			(sourceId) => sourceId !== 'G-SECTIONS' && !selectedSourceIds.includes(sourceId)
		)
	];
}

export const sectionHeaderUnrecognizedRule: RuleDefinition = {
	id: 'section.header-unrecognized',
	version: 1,
	defaultSeverity: 'manual-review',
	fixability: 'none',
	sourceIds: [
		'G-SECTIONS',
		'G-LANG-EN',
		'G-LANG-NO',
		'G-LANG-AR',
		'G-LANG-DE',
		'G-LANG-ES',
		'G-LANG-FR',
		'G-LANG-JA',
		'G-LANG-KO',
		'G-NON-ENGLISH'
	],
	check(document, context) {
		return document.sections.flatMap((section, sectionIndex) => {
			const header = section.header;
			// A nameless header is not a custom one. `Review the custom section
			// header “”` quoted nothing back at the user, offered `It's correct`
			// about it, and drew its underline over a zero-width range — and it was
			// the first thing anybody typing `[` and `]` met. `section.header-empty`
			// owns that line, and it owns it whether or not the bracket was closed:
			// this rule has nothing to say about a name that is not there.
			if (
				!header ||
				headerNameIsEmpty(header) ||
				isRecognizedHeader(header.namePart) ||
				isNonEnglishTitleHeader(header.namePart, context.language, sectionIndex)
			) {
				return [];
			}

			return [
				diagnostic(
					this,
					header.nameRange,
					`Review the custom section header “${header.namePart}”.`,
					`“${header.namePart}” is not in any reviewed section-header catalog. It may be intentional, but it could also be a typo. Confirm it manually; LyricLint preserves the text and does not guess a replacement.`,
					undefined,
					orderedSourceIds(
						context.language,
						this.sourceIds.filter((sourceId) => sourceId !== 'G-NON-ENGLISH')
					)
				)
			];
		});
	}
};
