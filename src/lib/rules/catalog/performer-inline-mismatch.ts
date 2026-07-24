import type { RuleDefinition } from '../../core/types.js';
import { diagnostic } from './utils.js';

export const performerInlineMismatchRule: RuleDefinition = {
	id: 'performer.inline-mismatch',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'none',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		if (context.performers.length < 2) {
			return [];
		}
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
							'The styled lyric is preserved as an unresolved voice. Add a matching legend group or explicitly reassign the passage after reviewing performer identity.'
						)
					];
				})
			);
		});
	}
};
