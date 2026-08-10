import type { Diagnostic, ParsedDocument, RuleDefinition, TextRange } from '$lib/core/types.js';
import { isImmediateRepeat } from './section-immediate-repeat-spacing.js';
import { diagnostic, replacementFix } from './utils.js';

/**
 * The run of blank lines between two sections, expressed as the range that has
 * to go for one of them to be left.
 *
 * Blank lines belong to no section — the parser closes the current one on each
 * of them — so the whole separator is the text between the previous section's
 * last line and the next section's first, and it is always some number of line
 * endings with optional whitespace between them. One ending means the header is
 * adjacent, which is `section.header-spacing`'s finding; two mean exactly one
 * blank line, which is the shape both rules are aiming at.
 *
 * What is returned is the tail of that gap rather than a replacement for it, so
 * the fix is a pure deletion: the first blank line keeps whatever line ending
 * and whitespace it was written with, and nothing is rewritten to normalize it.
 */
function extraBlankLineRange(
	document: ParsedDocument,
	sectionIndex: number
): TextRange | undefined {
	const previous = document.sections[sectionIndex - 1];
	const section = document.sections[sectionIndex];
	// An exact repeat split by blank lines belongs under one header, which is the
	// stronger finding and removes this gap entirely. One rule owns the question.
	if (!previous || !section || isImmediateRepeat(document, sectionIndex)) {
		return undefined;
	}

	const gap = document.text.slice(previous.to, section.from);
	const endings = [...gap.matchAll(/\r\n|\n|\r/gu)];
	const second = endings[1];
	if (endings.length < 3 || !second) {
		return undefined;
	}

	return { from: previous.to + second.index + second[0].length, to: section.from };
}

export const sectionExtraBlankLinesRule: RuleDefinition = {
	id: 'section.extra-blank-lines',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'safe',
	sourceIds: ['G-SECTIONS'],
	// The blank-line-before-header preference read from the other side: the
	// reviewed source is silent on how many empty lines a separator holds.
	derivation: true,
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (let index = 1; index < document.sections.length; index += 1) {
			const section = document.sections[index];
			const extra = extraBlankLineRange(document, index);
			// The blank lines themselves are the finding and are also the one range
			// nothing can be drawn on — an underline over them marks empty rows. The
			// mark goes on the section they sit above, exactly as the inverse rule
			// marks the header it wants a blank line before.
			const anchor = section?.header ?? section?.lines[0];
			if (!extra || !anchor) {
				continue;
			}

			diagnostics.push(
				diagnostic(
					this,
					{ from: anchor.from, to: anchor.to },
					// No count in the message: it would be rewritten on every line the
					// user deletes, which is a card replacing itself mid-correction.
					'Leave one blank line between song parts.',
					'The reviewed Genius guidance places headers above distinct song parts and does not say how many empty lines go between them. LyricLint keeps the separation to a single blank line so the gaps down a transcription stay even.',
					[replacementFix(context, 'safe', 'Remove extra blank lines', extra, '')]
				)
			);
		}
		return diagnostics;
	}
};
