import type { LanguagePack } from '../../core/types.js';
import {
	getLanguagePack,
	canLintHeaderLanguage,
	reviewedLanguagePacks
} from '../../languages/registry.js';
import type { RuleDefinition } from '../../core/types.js';
import { diagnostic, replacementFix } from './utils.js';

interface RecognizedHeader {
	pack: LanguagePack;
	semanticPart: string;
}

function recognizeInOtherReviewedPack(
	name: string,
	selected: LanguagePack
): RecognizedHeader | undefined {
	const normalized = name.trim().toLocaleLowerCase();
	for (const pack of reviewedLanguagePacks) {
		if (pack.tag === selected.tag) {
			continue;
		}
		for (const header of pack.headers) {
			if (header.terms.some((term) => term.toLocaleLowerCase() === normalized)) {
				return { pack, semanticPart: header.semanticPart };
			}
		}
	}
	return undefined;
}

function selectedTerms(pack: LanguagePack): Set<string> {
	return new Set(
		pack.headers.flatMap((header) => header.terms.map((term) => term.toLocaleLowerCase()))
	);
}

export const sectionHeaderLanguageRule: RuleDefinition = {
	id: 'section.header-language',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS', 'G-LANG-EN', 'G-LANG-NO'],
	check(document, context) {
		const selected = getLanguagePack(context.language);
		if (!canLintHeaderLanguage(selected)) {
			return [];
		}
		const accepted = selectedTerms(selected);
		return document.sections.flatMap((section) => {
			const header = section.header;
			if (!header || accepted.has(header.namePart.toLocaleLowerCase())) {
				return [];
			}
			const conflict = recognizeInOtherReviewedPack(header.namePart, selected);
			if (!conflict) {
				return [];
			}
			const replacement = selected.headers.find(
				(vocabulary) => vocabulary.semanticPart === conflict.semanticPart
			)?.terms[0];
			const sourceIds = ['G-SECTIONS', ...selected.sourceIds];
			return [
				diagnostic(
					this,
					header.nameRange,
					`“${header.namePart}” conflicts with the reviewed ${selected.displayName} header pack.`,
					`This is a recognized ${conflict.pack.displayName} ${conflict.semanticPart} header. The selected reviewed language pack recommends a localized term; custom and unreviewed headers are always preserved.`,
					replacement
						? [
								replacementFix(
									context,
									'preview',
									`Replace with ${replacement}`,
									header.nameRange,
									replacement
								)
							]
						: undefined,
					sourceIds
				)
			];
		});
	}
};
