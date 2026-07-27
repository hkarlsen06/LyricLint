import type { Diagnostic, LyricLine, RuleContext, RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

function symbolDiagnostic(
	rule: RuleDefinition,
	line: LyricLine,
	context: RuleContext,
	symbol: string,
	message: string,
	replacement: string
): Diagnostic[] {
	return matchesOutsideMarkup(line, new RegExp(symbol, 'gu')).map((match) =>
		diagnostic(rule, match, message, 'Genius omits this symbol from lyric text.', [
			replacementFix(
				context,
				'preview',
				replacement ? `Replace with ${replacement}` : 'Remove symbol',
				match,
				replacement
			)
		])
	);
}

export const symbolsSpecialCharactersRule: RuleDefinition = {
	id: 'symbols.special-characters',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-SYMBOLS'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				const findings = [
					...symbolDiagnostic(
						this,
						line,
						context,
						'[™®]',
						'Remove this trademark symbol from the lyric.',
						''
					),
					...symbolDiagnostic(
						this,
						line,
						context,
						'[★☆]',
						'Remove this decorative symbol from the lyric.',
						''
					)
				];

				if (!/^en(?:-|$)/iu.test(context.language)) return findings;

				for (const match of matchesOutsideMarkup(line, /[&°]/gu)) {
					const offset = match.from - line.from;
					if (match.text === '&') {
						if (
							!/\s/u.test(line.text[offset - 1] ?? '') ||
							!/\s/u.test(line.text[offset + 1] ?? '')
						) {
							continue;
						}
						findings.push(
							diagnostic(
								this,
								match,
								'Spell out this ampersand unless it belongs to a brand name.',
								'Genius writes this symbol as “and” in lyric text, while preserving it inside brand names. The surrounding spaces make this look like a word rather than a compact brand, but the replacement still needs review.',
								[replacementFix(context, 'preview', 'Replace with and', match, 'and')]
							)
						);
						continue;
					}

					const compactPrefix = line.text.slice(0, offset).match(/[\p{L}\p{N}:]+$/u)?.[0] ?? '';
					if (/\p{L}/u.test(compactPrefix) && /\d/u.test(compactPrefix)) continue;
					const replacement = `${/\s$/u.test(line.text.slice(0, offset)) ? '' : ' '}degrees`;
					findings.push(
						diagnostic(
							this,
							match,
							'Spell out this degree sign unless it belongs to a brand name.',
							'Genius writes this symbol as “degrees” in English lyric text, while preserving it inside brand names. Review the wording before replacing it.',
							[replacementFix(context, 'preview', 'Replace with degrees', match, replacement)]
						)
					);
				}

				return findings.sort((left, right) => left.from - right.from || left.to - right.to);
			})
		);
	}
};
