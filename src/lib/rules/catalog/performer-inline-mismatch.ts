import type { RuleDefinition } from '../../core/types.js';
import { diagnostic } from './utils.js';

export const performerInlineMismatchRule: RuleDefinition = {
	id: 'performer.inline-mismatch',
	version: 2,
	defaultSeverity: 'warning',
	fixability: 'none',
	sourceIds: ['G-SECTIONS'],
	check(document) {
		return document.sections.flatMap((section) => {
			const slots = new Set((section.header?.legendGroups ?? []).map((group) => group.styleSlot));
			return section.lines.flatMap((line) =>
				line.styleSpans.flatMap((span) => {
					if ('unsupported' in span || slots.has(span.slot)) {
						return [];
					}
					return [
						diagnostic(
							this,
							span,
							'Inline style has no performer in the section legend.',
							'The styled lyric is preserved as an unresolved voice. Choose the section voice and this styled voice to add the missing performer legend without changing the lyrics.'
						)
					];
				})
			);
		});
	}
};
