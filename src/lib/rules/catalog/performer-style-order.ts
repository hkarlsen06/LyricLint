import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic } from './utils.js';

export const performerStyleOrderRule: RuleDefinition = {
	id: 'performer.style-order',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS'],
	check(document) {
		return document.sections.flatMap((section) => {
			const groups = section.header?.legendGroups ?? [];
			if (groups.length === 0 || groups.length > 4) {
				return [];
			}
			const invalidIndex = groups.findIndex((group, index) => group.styleSlot !== index + 1);
			if (invalidIndex < 0) {
				return [];
			}
			const group = groups[invalidIndex]!;
			return [
				diagnostic(
					this,
					group,
					'Performer legend styles are out of slot order.',
					'Section-local performer groups should appear in plain, italic, bold, then bold-italic order. Reordering is preview-only because group identity must be preserved.'
				)
			];
		});
	}
};
