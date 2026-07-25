import type { RuleDefinition } from '../../core/types.js';
import {
	canLintHeaderLanguage,
	getLanguagePack,
	reviewedLanguagePacks
} from '../../languages/registry.js';
import { diagnostic } from './utils.js';

function isRecognizedHeader(name: string): boolean {
	const normalized = name.trim().toLocaleLowerCase();
	return reviewedLanguagePacks.some((pack) =>
		pack.headers.some((header) =>
			header.terms.some((term) => term.toLocaleLowerCase() === normalized)
		)
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
		'G-LANG-KO'
	],
	check(document, context) {
		return document.sections.flatMap((section) => {
			const header = section.header;
			if (!header || isRecognizedHeader(header.namePart)) {
				return [];
			}

			return [
				diagnostic(
					this,
					header.nameRange,
					`Review the custom section header “${header.namePart}”.`,
					`“${header.namePart}” is not in any reviewed section-header catalog. It may be intentional, but it could also be a typo. Confirm it manually; LyricLint preserves the text and does not guess a replacement.`,
					undefined,
					orderedSourceIds(context.language, this.sourceIds)
				)
			];
		});
	}
};
