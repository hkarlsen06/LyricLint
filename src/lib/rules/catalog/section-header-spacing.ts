import type { Diagnostic, ParsedDocument, RuleDefinition } from '$lib/core/types.js';
import { isImmediateRepeat } from './section-immediate-repeat-spacing.js';
import { diagnostic, replacementFix } from './utils.js';

function adjacentLineEnding(document: ParsedDocument, sectionIndex: number): string | undefined {
	const previous = document.sections[sectionIndex - 1];
	const section = document.sections[sectionIndex];
	if (!previous || !section?.header || isImmediateRepeat(document, sectionIndex)) {
		return undefined;
	}

	const gap = document.text.slice(previous.to, section.from);
	return /^(?:\r\n|\n|\r)$/u.test(gap) ? gap : undefined;
}

export const sectionHeaderSpacingRule: RuleDefinition = {
	id: 'section.header-spacing',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'safe',
	sourceIds: ['G-SECTIONS'],
	// A readability suggestion of LyricLint's own: the reviewed source puts
	// headers above distinct parts but never requires the blank line.
	derivation: true,
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (let index = 1; index < document.sections.length; index += 1) {
			const section = document.sections[index];
			const lineEnding = adjacentLineEnding(document, index);
			if (!section?.header || !lineEnding) {
				continue;
			}

			diagnostics.push(
				diagnostic(
					this,
					{ from: section.header.from, to: section.header.to },
					'Add a blank line before this section header.',
					'The reviewed Genius guidance places headers above distinct song parts but does not explicitly require a blank line. LyricLint suggests one here to make section changes easier to scan.',
					[
						replacementFix(
							context,
							'safe',
							'Add blank line',
							{ from: section.from, to: section.from },
							lineEnding
						)
					]
				)
			);
		}
		return diagnostics;
	}
};
