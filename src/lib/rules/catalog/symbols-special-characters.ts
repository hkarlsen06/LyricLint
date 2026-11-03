import type { Diagnostic, RuleDefinition } from '#lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

const symbols = /[™®★☆&°]/gu;

export const symbolsSpecialCharactersRule: RuleDefinition = {
	id: 'symbols.special-characters',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-SYMBOLS'],
	// A flagged symbol is that symbol whatever follows it; the match is a single
	// character and cannot grow into something else.
	settlesOn: 'character',
	check(document, context) {
		const english = /^en(?:-|$)/iu.test(context.language);
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				const findings: Diagnostic[] = [];
				for (const match of matchesOutsideMarkup(line, symbols)) {
					if (
						match.text === '™' ||
						match.text === '®' ||
						match.text === '★' ||
						match.text === '☆'
					) {
						const trademark = match.text === '™' || match.text === '®';
						findings.push(
							diagnostic(
								this,
								match,
								trademark
									? 'Remove this trademark symbol from the lyric.'
									: 'Remove this decorative symbol from the lyric.',
								'Genius omits this symbol from lyric text.',
								[replacementFix(context, 'preview', 'Remove symbol', match, '')]
							)
						);
						continue;
					}
					if (!english) continue;
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

				if (!english) {
					// Keep the rule's existing category order outside English.
					findings.sort(
						(left, right) =>
							Number('★☆'.includes(line.text[left.from - line.from]!)) -
							Number('★☆'.includes(line.text[right.from - line.from]!))
					);
				}
				return findings;
			})
		);
	}
};
