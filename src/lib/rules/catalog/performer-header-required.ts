import type { RuleDefinition } from '../../core/types.js';
import { diagnostic } from './utils.js';

export const performerHeaderRequiredRule: RuleDefinition = {
	id: 'performer.header-required',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		if (context.performers.length < 2) {
			return [];
		}
		return document.sections.flatMap((section) => {
			const hasInlineStyle = section.lines.some((line) =>
				line.styleSpans.some((span) => !('unsupported' in span))
			);
			if (!hasInlineStyle || (section.header?.legendGroups.length ?? 0) > 0) {
				return [];
			}
			const range = section.header?.nameRange ?? { from: section.from, to: section.from };
			return [
				diagnostic(
					this,
					range,
					'Styled vocals need a performer legend.',
					'This multi-performer section differentiates inline vocals but its header does not identify the style slots. Add or preview a performer legend without discarding the existing styling.'
				)
			];
		});
	}
};
