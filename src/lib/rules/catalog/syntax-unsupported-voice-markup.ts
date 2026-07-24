import type { Diagnostic, RuleDefinition } from '../../core/types.js';
import { diagnostic } from './utils.js';

export const syntaxUnsupportedVoiceMarkupRule: RuleDefinition = {
	id: 'syntax.unsupported-voice-markup',
	version: 1,
	defaultSeverity: 'error',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS'],
	check(document) {
		const diagnostics: Diagnostic[] = document.syntaxIssues
			.filter((issue) => issue.code === 'unsupported-markup' || issue.code === 'malformed-markup')
			.map((issue) =>
				diagnostic(
					this,
					issue,
					'Unsupported performer markup.',
					'Performer differentiation supports plain, italic, bold, and nested bold-italic slots. This literal tag or malformed nesting is preserved for review.'
				)
			);

		for (const section of document.sections) {
			for (const group of section.header?.legendGroups ?? []) {
				if (!group.markupSupported) {
					diagnostics.push(
						diagnostic(
							this,
							group,
							'Unsupported performer markup in the section legend.',
							'The section legend uses markup outside the four supported differentiation slots. It is preserved and requires a previewed correction.'
						)
					);
				}
			}
		}
		return diagnostics;
	}
};
