import { getLanguagePack, canLintHeaderLanguage } from '$lib/languages/registry.js';
import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';
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
	version: 5,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		return document.sections.flatMap((section, index) => {
			if (
				isImmediateHeaderlessRepeat(document, index) ||
				section.header ||
				!section.lines.some((line) => line.text.trim().length > 0)
			) {
				return [];
			}

			const previous = document.sections[index - 1];
			const boundary = previous ? document.text.slice(previous.to, section.from) : '';
			const lineEnding = /^(?:\r\n|\r|\n)/u.exec(boundary)?.[0];
			const blankLineRange =
				previous && lineEnding
					? { from: previous.to + lineEnding.length, to: section.from }
					: undefined;

			return [
				{
					...diagnostic(
						this,
						{ from: section.from, to: section.from },
						'This lyric section has no header.',
						'Every blank-line lyric section needs a song-part header. If these lines continue the previous song part, remove the blank line instead—Genius does not allow blank lines to split one part into smaller stanzas. Otherwise, choose a reviewed localized term or enter a custom header; the source text remains unchanged until confirmation.',
						blankLineRange
							? [replacementFix(context, 'preview', 'Remove blank line', blankLineRange, '')]
							: undefined,
						headerSourceIds(context.language)
					),
					...(blankLineRange ? { relatedRanges: [blankLineRange] } : {})
				}
			];
		});
	}
};
