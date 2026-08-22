import { getLanguagePack, canLintHeaderLanguage } from '$lib/languages/registry.js';
import type { RuleDefinition, Section } from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';
import { isImmediateHeaderlessRepeat } from './section-immediate-repeat-spacing.js';
import { sectionLeadsWithProseHeader } from './section-header-prose.js';

function headerSourceIds(language: string): string[] {
	const pack = getLanguagePack(language);
	if (!canLintHeaderLanguage(pack)) {
		return ['G-SECTIONS'];
	}
	return ['G-SECTIONS', ...pack.sourceIds];
}

/**
 * A section led by a written-out label has a header — it is simply not
 * bracketed, which is `section.header-prose`'s finding and its one-press fix.
 * Reporting it as headerless too puts two cards on one line, the leading one
 * denying the header the second one is quoting.
 *
 * The *leading* line only. A headerless section with `Chorus:` somewhere down
 * it really does start without a header, and both findings are then true about
 * different lines.
 */
function leadsWithProseHeader(section: Section, language: string): boolean {
	return sectionLeadsWithProseHeader(section, language);
}

export const sectionHeaderMissingRule: RuleDefinition = {
	id: 'section.header-missing',
	version: 7,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS'],
	// A section has no header until one is typed, and somebody transcribing by ear
	// types the words first. This fired on the document's first keystroke.
	settlesOn: 'document',
	check(document, context) {
		return document.sections.flatMap((section, index) => {
			if (
				isImmediateHeaderlessRepeat(document, index) ||
				section.header ||
				!section.lines.some((line) => line.text.trim().length > 0) ||
				leadsWithProseHeader(section, context.language)
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

			const finding = diagnostic(
				this,
				{ from: section.from, to: section.from },
				'This lyric section has no header.',
				'Every blank-line lyric section needs a song-part header. If these lines continue the previous song part, remove the blank line instead—Genius does not allow blank lines to split one part into smaller stanzas. Otherwise, choose a reviewed localized term or enter a custom header; the source text remains unchanged until confirmation.',
				blankLineRange
					? [replacementFix(context, 'preview', 'Remove blank line', blankLineRange, '')]
					: undefined,
				headerSourceIds(context.language)
			);
			if (blankLineRange) finding.relatedRanges = [blankLineRange];
			return [finding];
		});
	}
};
