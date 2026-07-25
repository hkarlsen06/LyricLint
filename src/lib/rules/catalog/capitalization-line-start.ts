import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, replacementFix, visibleLineStart } from './utils.js';

export const capitalizationLineStartRule: RuleDefinition = {
	id: 'capitalization.line-start',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-CAPS'],
	check(document, context) {
		if (!/^(?:en|no)(?:-|$)/iu.test(context.language)) {
			return [];
		}
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				const start = visibleLineStart(line);
				if (!start || !/^\p{Ll}/u.test(start.text)) {
					return [];
				}
				const firstWord = /^\p{L}[\p{L}\p{M}'’-]*/u.exec(start.text)?.[0] ?? '';
				if (
					!/\s+\S+/u.test(start.text) ||
					/\p{Ll}\p{Lu}/u.test(firstWord) ||
					// Matched against the visible line text, not the first word: the
					// word pattern stops at the dot in a stylized name like `e.e.`.
					/^(?:e\.e\.|iPhone|iPad|iOS)/u.test(start.text)
				) {
					return [];
				}
				const first = start.text[0] ?? '';
				const range = { from: start.offset, to: start.offset + first.length };
				return [
					diagnostic(
						this,
						range,
						'This lyric line starts with a lowercase letter.',
						'Conventional capitalization suggests an uppercase line start, but stylization and continuation can be valid; review the preview in context.',
						[
							replacementFix(
								context,
								'preview',
								`Capitalize ${first}`,
								range,
								first.toLocaleUpperCase()
							)
						]
					)
				];
			})
		);
	}
};
