import type { Diagnostic, LyricLine, RuleDefinition } from '$lib/core/types.js';
import { diagnostic, hasUnsupportedMarkup, maskedMarkupText } from './utils.js';

export interface ParenthesisScan {
	/** Matched pairs, each end an absolute document offset of its own mark. */
	pairs: { open: number; close: number }[];
	/** Opening marks that never close, in absolute document offsets. */
	strayOpens: number[];
	/** Closing marks that never opened, in absolute document offsets. */
	strayCloses: number[];
}

/**
 * Pairs a line's parentheses by nesting order. This rule reports the strays
 * and owns that question; `punctuation.parenthesis-spacing` reads only the
 * pairs, so a mistyped parenthesis is one finding rather than two rules
 * arguing over the same character.
 */
export function scanParentheses(line: LyricLine): ParenthesisScan {
	const scan: ParenthesisScan = { pairs: [], strayOpens: [], strayCloses: [] };
	if (hasUnsupportedMarkup(line)) {
		return scan;
	}
	const masked = maskedMarkupText(line);
	const openStack: number[] = [];
	for (let index = 0; index < masked.length; index += 1) {
		const character = masked[index];
		if (character === '(') {
			openStack.push(line.from + index);
		} else if (character === ')') {
			const open = openStack.pop();
			if (open === undefined) {
				scan.strayCloses.push(line.from + index);
			} else {
				scan.pairs.push({ open, close: line.from + index });
			}
		}
	}
	scan.strayOpens.push(...openStack);
	return scan;
}

const explanation =
	'Parentheses wrap a vocal sitting behind the lead, so every opening mark needs its closing ' +
	'half on the same line. Detecting the imbalance is a product-safety check derived from that ' +
	'convention, not an explicit Genius catalog of every malformed case — and where the mark ' +
	'should close is a judgment about the vocal, so no automatic repair is offered.';

export const syntaxUnbalancedParenthesesRule: RuleDefinition = {
	id: 'syntax.unbalanced-parentheses',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'none',
	sourceIds: ['G-ADLIBS'],
	check(document) {
		const diagnostics: Diagnostic[] = [];
		for (const section of document.sections) {
			for (const line of section.lines) {
				const scan = scanParentheses(line);
				for (const from of scan.strayOpens) {
					diagnostics.push(
						diagnostic(
							this,
							{ from, to: from + 1 },
							'This parenthesis is never closed.',
							explanation
						)
					);
				}
				for (const from of scan.strayCloses) {
					diagnostics.push(
						diagnostic(
							this,
							{ from, to: from + 1 },
							'This parenthesis was never opened.',
							explanation
						)
					);
				}
			}
		}
		return diagnostics;
	}
};
