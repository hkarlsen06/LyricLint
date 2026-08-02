import type { LanguagePack } from '$lib/core/types.js';
import {
	getLanguagePack,
	canLintHeaderLanguage,
	reviewedLanguagePacks
} from '$lib/languages/registry.js';
import type { RuleDefinition } from '$lib/core/types.js';
import { localizedHeaderPreference } from './section-localized-header-preference.js';
import { diagnostic, replacementFix } from './utils.js';

interface RecognizedHeader {
	pack: LanguagePack;
	semanticPart: string;
}

function recognizeInOtherReviewedPack(
	name: string,
	selected: LanguagePack
): RecognizedHeader | undefined {
	const normalized = name.trim().toLocaleLowerCase('en');
	for (const pack of reviewedLanguagePacks) {
		if (pack.tag === selected.tag) {
			continue;
		}
		for (const header of pack.headers) {
			if (header.terms.some((term) => term.toLocaleLowerCase('en') === normalized)) {
				return { pack, semanticPart: header.semanticPart };
			}
		}
	}
	return undefined;
}

function selectedCanonicalTerm(pack: LanguagePack, name: string): string | undefined {
	const normalized = name.trim().toLocaleLowerCase(pack.tag);
	return pack.headers
		.flatMap((header) => header.terms)
		.find((term) => term.toLocaleLowerCase(pack.tag) === normalized);
}

export const sectionHeaderLanguageRule: RuleDefinition = {
	id: 'section.header-language',
	version: 2,
	defaultSeverity: 'warning',
	fixability: 'preview',
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
		const selected = getLanguagePack(context.language);
		if (!canLintHeaderLanguage(selected)) {
			return [];
		}
		return document.sections.flatMap((section) => {
			const header = section.header;
			if (!header || localizedHeaderPreference(context.language, header.namePart)) {
				return [];
			}
			const canonical = selectedCanonicalTerm(selected, header.namePart);
			if (canonical) {
				if (header.namePart === canonical) {
					return [];
				}
				return [
					diagnostic(
						this,
						header.nameRange,
						`Use the reviewed capitalization “${canonical}”.`,
						`This section header matches the reviewed ${selected.displayName} term “${canonical}”, but its letter case does not. Using the catalog spelling keeps section headers consistent.`,
						[replacementFix(context, 'safe', `Use ${canonical}`, header.nameRange, canonical)],
						['G-SECTIONS', ...selected.sourceIds]
					)
				];
			}
			const conflict = recognizeInOtherReviewedPack(header.namePart, selected);
			if (!conflict) {
				return [];
			}
			const replacements = selected.headers.find(
				(vocabulary) => vocabulary.semanticPart === conflict.semanticPart
			)?.terms;
			const sourceIds = ['G-SECTIONS', ...selected.sourceIds];
			return [
				diagnostic(
					this,
					header.nameRange,
					`“${header.namePart}” conflicts with the reviewed ${selected.displayName} header pack.`,
					`This is a recognized ${conflict.pack.displayName} ${conflict.semanticPart} header. The selected reviewed language pack recommends a localized term; custom and unreviewed headers are always preserved.`,
					replacements
						? replacements.map((replacement) =>
								replacementFix(
									context,
									'preview',
									`Replace with ${replacement}`,
									header.nameRange,
									replacement
								)
							)
						: undefined,
					sourceIds
				)
			];
		});
	}
};
