import type { RuleDefinition } from '#lib/core/types.js';
import { type CatalogLookup, diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

/**
 * The straight mark each non-typewriter mark becomes, and the name that tells one
 * occurrence from another.
 *
 * The message has to carry the name because the character cannot. A line
 * holding both halves of a pair reports twice on the same line number, so the
 * meta line (severity, line, citation) is identical on both rows and the
 * message is the only thing left to separate them. Printing the mark itself
 * does not: `“` and `”` differ by the direction of a curl at 15px, which is
 * exactly the size the panel draws them at.
 */
export const quoteMarks: CatalogLookup<{
	straight: string;
	name: string;
	fix: 'safe' | 'preview';
}> = {
	'‘': { straight: "'", name: 'opening curly single quote', fix: 'safe' },
	'’': { straight: "'", name: 'closing curly single quote', fix: 'safe' },
	'‚': { straight: "'", name: 'low single quote', fix: 'safe' },
	'‛': { straight: "'", name: 'reversed single quote', fix: 'safe' },
	'‹': { straight: "'", name: 'opening single guillemet', fix: 'safe' },
	'›': { straight: "'", name: 'closing single guillemet', fix: 'safe' },
	'“': { straight: '"', name: 'opening curly double quote', fix: 'safe' },
	'”': { straight: '"', name: 'closing curly double quote', fix: 'safe' },
	'„': { straight: '"', name: 'low double quote', fix: 'safe' },
	'‟': { straight: '"', name: 'reversed double quote', fix: 'safe' },
	'«': { straight: '"', name: 'opening double guillemet', fix: 'safe' },
	'»': { straight: '"', name: 'closing double guillemet', fix: 'safe' },
	'´': { straight: "'", name: 'acute accent', fix: 'preview' }
};

const quotePattern = new RegExp(`[${Object.keys(quoteMarks).join('')}]`, 'gu');

/**
 * Languages whose Genius communities quote with guillemets. There, every
 * double-quote form, the straight `"` included, becomes `«` or `»`; single
 * marks still straighten to `'`, because most of them are apostrophes.
 */
export const guillemetLanguages = new Set(['no', 'nb', 'nn', 'da', 'sv', 'is', 'fo']);
const guillemetPattern = new RegExp(`[${Object.keys(quoteMarks).join('')}"]`, 'gu');
const openingDoubles = new Set(['“', '„', '‟', '«']);

/**
 * A straight mark can start a nested pair when it sits at the start of text.
 * Otherwise, use the open pair on this line to guess its direction.
 */
function guillemetFor(mark: string, openDouble: string | undefined, before: string, after: string) {
	const atClosingBoundary = after === '' || /[\s\p{Pe}\p{Pf}.,!?;:]/u.test(after);
	if (mark === '"') {
		const startsText =
			(/[\s\p{Ps}]/u.test(before) || openingDoubles.has(before)) && !atClosingBoundary;
		return {
			replacement: openDouble === undefined || startsText ? '«' : '»',
			fix: 'preview' as const
		};
	}
	// The low form `„bli her“` closes with the curly opener.
	if (mark === '“' && openDouble === '„') return { replacement: '»', fix: 'safe' as const };
	// The low opener may already have been fixed. Keep this guess out of the batch.
	if (mark === '“' && openDouble === '«' && /\S/u.test(before) && atClosingBoundary) {
		return { replacement: '»', fix: 'preview' as const };
	}
	return { replacement: openingDoubles.has(mark) ? '«' : '»', fix: 'safe' as const };
}

/**
 * `’` between two letters is an apostrophe, not the closing half of anything,
 * and in real lyrics that is most of what this rule points at. Naming it as a
 * closing quote would trade one indistinguishable message for a confidently
 * wrong one.
 */
function isApostrophe(text: string, index: number): boolean {
	return /\p{L}/u.test(text[index - 1] ?? '') && /\p{L}/u.test(text[index + 1] ?? '');
}

export const quotesTypewriterRule: RuleDefinition = {
	id: 'quotes.typewriter',
	version: 5,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-TYPEWRITER'],
	// Not `character`, though the *finding* would qualify: `isApostrophe` reads
	// `text[index + 1]`, so `Don’` reports the closing curly single quote and
	// `Don’t` reports a curly apostrophe. Left at `character` the card was
	// replaced by a differently worded one on the next keystroke, on every
	// `don't`, `I'm` and `ain't` in the song, which is constantly.
	settlesOn: 'line',
	check(document, context) {
		const guillemets = guillemetLanguages.has(context.language.toLowerCase().split('-')[0]);
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				const openDoubles: string[] = [];
				return matchesOutsideMarkup(line, guillemets ? guillemetPattern : quotePattern).flatMap(
					(match) => {
						const offset = match.from - line.from;
						const mark = quoteMarks[match.text];
						const straightDouble = match.text === '"';
						if (guillemets && (straightDouble || mark?.straight === '"')) {
							const { replacement, fix } = guillemetFor(
								match.text,
								openDoubles.at(-1),
								line.text[offset - 1] ?? '',
								line.text[offset + 1] ?? ''
							);
							if (replacement === '«') openDoubles.push(match.text);
							else openDoubles.pop();
							if (replacement === match.text) return [];
							const name = mark?.name ?? 'straight double quote';
							return diagnostic(
								this,
								match,
								`Use ${replacement} instead of the ${name}.`,
								fix === 'safe'
									? 'Nordic transcriptions quote with guillemets, and this mark already says which half it is, so it can be replaced mechanically.'
									: 'Nordic transcriptions quote with guillemets. Check whether this mark opens or closes the quotation before replacing it.',
								[replacementFix(context, fix, `Replace with ${replacement}`, match, replacement)]
							);
						}
						if (!mark) return [];
						// A spacing accent beside a word can be an apostrophe typo.
						// Keep standalone accent notation and actual combining accents intact.
						if (
							match.text === '´' &&
							!/\p{L}\p{M}*$/u.test(line.text.slice(0, offset)) &&
							!/^\p{L}/u.test(line.text.slice(offset + 1))
						) {
							return [];
						}
						const replacement = mark.straight;
						const name =
							match.text === '’' && isApostrophe(line.text, match.from - line.from)
								? 'curly apostrophe'
								: mark.name;
						return diagnostic(
							this,
							match,
							`Use a straight ${replacement} instead of the ${name}.`,
							mark.fix === 'preview'
								? 'A spacing acute accent beside a word can be a mistyped apostrophe. Check the intended mark before replacing it with a straight apostrophe.'
								: 'The exact curly quote can be replaced mechanically. Lines containing unsupported markup are excluded so the fixer never rewrites uncertain markup.',
							// The label stays the bare replacement, so the two halves of a
							// pair share one `Fix all 2` batch: replacing `“` and `”` with `"`
							// is the same command, and the card's diff honestly stands in for
							// both.
							[replacementFix(context, mark.fix, `Replace with ${replacement}`, match, replacement)]
						);
					}
				);
			})
		);
	}
};
