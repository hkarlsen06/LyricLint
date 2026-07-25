import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic } from './utils.js';

export const performerTooManyGroupsRule: RuleDefinition = {
	id: 'performer.too-many-groups',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'none',
	sourceIds: ['G-SECTIONS'],
	check(document) {
		return document.sections.flatMap((section) => {
			const groups = section.header?.legendGroups ?? [];
			if (groups.length <= 4) {
				return [];
			}
			const range = section.header?.legendRange ?? section.header ?? section;
			return [
				diagnostic(
					this,
					range,
					'This section has more voice groups than the four formatting slots.',
					'The source discusses omitting names when too many vocalists prevent concise formatting and gives a more-than-four example for multiple vocal samples; it does not state a universal five-performer ban. Preserve the import while considering a merged group, another section, or explicitly removing differentiation.'
				)
			];
		});
	}
};
