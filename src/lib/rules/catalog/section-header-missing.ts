import { getLanguagePack, canLintHeaderLanguage } from '../../languages/registry.js';
import type { RuleDefinition } from '../../core/types.js';
import { diagnostic } from './utils.js';
import { isImmediateHeaderlessRepeat } from './section-immediate-repeat-spacing.js';

function headerSourceIds(language: string): string[] {
	const pack = getLanguagePack(language);
	if (!canLintHeaderLanguage(pack)) {
		return ['G-SECTIONS'];
	}
	return ['G-SECTIONS', ...pack.sourceIds];
}

export const sectionHeaderMissingRule: RuleDefinition = {
	id: 'section.header-missing',
	version: 2,
	defaultSeverity: 'warning',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		return document.sections
			.filter((_, index) => !isImmediateHeaderlessRepeat(document, index))
			.filter(
				(section) => !section.header && section.lines.some((line) => line.text.trim().length > 0)
			)
			.map((section) => {
				const range = { from: section.from, to: section.from };
				return diagnostic(
					this,
					range,
					'This lyric section has no header.',
					'Blank-line sections containing lyrics should have a song-part header. Choose a reviewed localized term or enter a custom header; the source text remains unchanged until confirmation.',
					undefined,
					headerSourceIds(context.language)
				);
			});
	}
};
