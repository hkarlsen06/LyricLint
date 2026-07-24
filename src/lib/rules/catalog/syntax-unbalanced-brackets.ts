import type { Diagnostic, RuleDefinition } from '../../core/types.js';
import { diagnostic, replacementFix } from './utils.js';

export const syntaxUnbalancedBracketsRule: RuleDefinition = {
	id: 'syntax.unbalanced-brackets',
	version: 1,
	defaultSeverity: 'error',
	fixability: 'safe',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = document.syntaxIssues
			.filter((issue) => issue.code === 'unbalanced-section-bracket')
			.map((issue) =>
				diagnostic(
					this,
					issue,
					'Section header has unbalanced brackets.',
					'Genius guidance establishes bracketed section headers. Detecting a missing delimiter is also a product-safety rule from the parser contract, not an explicit Genius catalog of every malformed case.',
					[replacementFix(context, 'safe', 'Insert the missing closing bracket', issue, ']')]
				)
			);
		for (const section of document.sections) {
			const header = section.header;
			if (!header?.closed) {
				continue;
			}
			const openings = header.raw.match(/\[/gu)?.length ?? 0;
			const closings = header.raw.match(/\]/gu)?.length ?? 0;
			if (openings === closings) {
				continue;
			}
			diagnostics.push(
				diagnostic(
					this,
					header,
					'Section header has unbalanced brackets.',
					'Genius guidance establishes bracketed section headers. This uneven delimiter count is also a product-safety finding from the parser contract, not an explicit Genius catalog of every malformed case.'
				)
			);
		}
		return diagnostics;
	}
};
