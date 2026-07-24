import { getLanguagePack, canLintHeaderLanguage } from '../../languages/registry.js';
import type { RuleDefinition } from '../../core/types.js';
import { diagnostic, replacementFix } from './utils.js';
import { isImmediateHeaderlessRepeat } from './section-immediate-repeat-spacing.js';

function suggestedHeader(language: string): { term: string; sourceIds: string[] } | undefined {
	const pack = getLanguagePack(language);
	if (!canLintHeaderLanguage(pack)) {
		return undefined;
	}
	const term = pack.headers.find((header) => header.semanticPart === 'Verse')?.terms[0];
	return term ? { term, sourceIds: pack.sourceIds } : undefined;
}

export const sectionHeaderMissingRule: RuleDefinition = {
	id: 'section.header-missing',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		return document.sections
			.filter((_, index) => !isImmediateHeaderlessRepeat(document, index))
			.filter(
				(section) => !section.header && section.lines.some((line) => line.text.trim().length > 0)
			)
			.map((section) => {
				const suggestion = suggestedHeader(context.language);
				const range = { from: section.from, to: section.from };
				return diagnostic(
					this,
					range,
					'This lyric section has no header.',
					'Blank-line sections containing lyrics should have a song-part header. Choose a reviewed localized term or enter a custom header; the source text remains unchanged until confirmation.',
					suggestion
						? [
								replacementFix(
									context,
									'preview',
									`Insert [${suggestion.term}]`,
									range,
									`[${suggestion.term}]\n`
								)
							]
						: undefined,
					suggestion ? ['G-SECTIONS', ...suggestion.sourceIds] : this.sourceIds
				);
			});
	}
};
