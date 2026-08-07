import type { Diagnostic, RuleDefinition } from '$lib/core/types.js';
import { diagnostic, maskedMarkupText, replacementFix } from './utils.js';
import { scanParentheses } from './syntax-unbalanced-parentheses.js';

const letterOrDigit = /[\p{L}\p{M}\p{N}]/u;

const explanation =
	'A parenthesized vocal is a word of its own, so the parenthesis does not sit flush against ' +
	'the letter beside it. Inserting the space is mechanically safe. This spacing check is ' +
	'derived from how the reviewed ad-lib examples are set, not an explicit Genius rule.';

export const punctuationParenthesisSpacingRule: RuleDefinition = {
	id: 'punctuation.parenthesis-spacing',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'safe',
	sourceIds: ['G-ADLIBS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (const section of document.sections) {
			for (const line of section.lines) {
				// Only marks that pair up: a stray parenthesis is
				// `syntax.unbalanced-parentheses`'s finding, and offering to space out a
				// mark that is likely a typo for its other half would be wrong advice
				// beside the real one.
				const scan = scanParentheses(line);
				if (scan.pairs.length === 0) {
					continue;
				}
				const masked = maskedMarkupText(line);
				for (const pair of scan.pairs) {
					const beforeOpen = masked[pair.open - line.from - 1];
					if (beforeOpen !== undefined && letterOrDigit.test(beforeOpen)) {
						diagnostics.push(
							diagnostic(
								this,
								{ from: pair.open, to: pair.open + 1 },
								'Add a space before this parenthesis.',
								explanation,
								[
									replacementFix(
										context,
										'safe',
										'Add a space',
										{ from: pair.open, to: pair.open },
										' '
									)
								]
							)
						);
					}
					const afterClose = masked[pair.close - line.from + 1];
					if (afterClose !== undefined && letterOrDigit.test(afterClose)) {
						diagnostics.push(
							diagnostic(
								this,
								{ from: pair.close, to: pair.close + 1 },
								'Add a space after this parenthesis.',
								explanation,
								[
									replacementFix(
										context,
										'safe',
										'Add a space',
										{ from: pair.close + 1, to: pair.close + 1 },
										' '
									)
								]
							)
						);
					}
				}
			}
		}
		return diagnostics;
	}
};
