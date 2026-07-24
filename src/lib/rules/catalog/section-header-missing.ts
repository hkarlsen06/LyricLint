import { getLanguagePack, canLintHeaderLanguage } from '../../languages/registry.js';
import type { RuleDefinition } from '../../core/types.js';
import { diagnostic, replacementFix } from './utils.js';

function suggestedHeader(language: string): string | undefined {
	const pack = getLanguagePack(language);
	if (!canLintHeaderLanguage(pack)) {
		return undefined;
	}
	return pack.headers.find((header) => header.semanticPart === 'Verse')?.terms[0];
}

export const sectionHeaderMissingRule: RuleDefinition = {
	id: 'section.header-missing',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		return document.sections
			.filter(
				(section) => !section.header && section.lines.some((line) => line.text.trim().length > 0)
			)
			.map((section) => {
				const header = suggestedHeader(context.language);
				const range = { from: section.from, to: section.from };
				return diagnostic(
					this,
					range,
					'This lyric section has no header.',
					'Blank-line sections containing lyrics should have a song-part header. Choose a reviewed localized term or enter a custom header; the source text remains unchanged until confirmation.',
					header
						? [replacementFix(context, 'preview', `Insert [${header}]`, range, `[${header}]\n`)]
						: undefined
				);
			});
	}
};
