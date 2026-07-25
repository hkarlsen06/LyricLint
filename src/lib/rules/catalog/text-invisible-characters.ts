import type { Diagnostic, RuleDefinition, TextRange } from '$lib/core/types.js';
import { INVISIBLE_CHARACTERS } from '$lib/core/invisible-characters.js';
import { diagnostic, replacementFix } from './utils.js';

/** Whitespace that is not a line terminator, sitting at the end of a line. */
const TRAILING_WHITESPACE = /[^\S\r\n]+(?=\r\n|\n|\r|$)/gu;

export const textInvisibleCharactersRule: RuleDefinition = {
	id: 'text.invisible-characters',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'safe',
	sourceIds: ['G-ADD-SONGS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		const text = document.text;
		const trailingOffsets = new Set<number>();

		for (const match of text.matchAll(TRAILING_WHITESPACE)) {
			const range: TextRange = { from: match.index, to: match.index + match[0].length };
			for (let offset = range.from; offset < range.to; offset += 1) {
				trailingOffsets.add(offset);
			}
			diagnostics.push(
				diagnostic(
					this,
					range,
					'This line ends with invisible whitespace.',
					'Trailing spaces survive a copy into Genius without ever being visible in the editor. Removing them changes nothing a reader can see, and the parser already treats a whitespace-only line as a blank one, so no section boundary moves.',
					[replacementFix(context, 'safe', 'Remove trailing whitespace', range, '')]
				)
			);
		}

		for (let index = 0; index < text.length; index += 1) {
			// A trailing run is already reported as one finding; reporting the
			// characters inside it again would put two safe fixes on the same
			// offsets, and arbitration would drop one of them at random.
			if (trailingOffsets.has(index)) {
				continue;
			}
			const invisible = INVISIBLE_CHARACTERS.get(text[index] ?? '');
			if (!invisible) {
				continue;
			}

			const range: TextRange = { from: index, to: index + 1 };
			diagnostics.push(
				diagnostic(
					this,
					range,
					`This is ${invisible.description}, not the character it looks like.`,
					`Pasted text carries ${invisible.description} that is indistinguishable from an ordinary space — or from nothing at all — while editing, but it is a different character in the copied markup. LyricLint marks it in the editor so the finding has something visible to point at.`,
					[replacementFix(context, 'safe', invisible.fixLabel, range, invisible.replacement)]
				)
			);
		}

		return diagnostics;
	}
};
