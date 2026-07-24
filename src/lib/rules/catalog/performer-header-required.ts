import type { RuleDefinition, Section, TextEdit } from '../../core/types.js';
import { diagnostic } from './utils.js';

function removePerformerFormatting(section: Section): TextEdit[] {
	const edits: TextEdit[] = [];

	for (const line of section.lines) {
		for (const span of line.styleSpans) {
			if ('unsupported' in span) {
				continue;
			}
			if (span.from < span.contentFrom) {
				edits.push({ from: span.from, to: span.contentFrom, insert: '' });
			}
			if (span.contentTo < span.to) {
				edits.push({ from: span.contentTo, to: span.to, insert: '' });
			}
		}
	}

	return edits.sort((left, right) => left.from - right.from || left.to - right.to);
}

export const performerHeaderRequiredRule: RuleDefinition = {
	id: 'performer.header-required',
	version: 2,
	defaultSeverity: 'warning',
	fixability: 'safe',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		if (context.performers.length < 2) {
			return [];
		}
		return document.sections.flatMap((section) => {
			const edits = removePerformerFormatting(section);
			if (edits.length === 0 || (section.header?.legendGroups.length ?? 0) > 0) {
				return [];
			}
			const range = section.header?.nameRange ?? { from: section.from, to: section.from };
			return [
				diagnostic(
					this,
					range,
					'Styled vocals need a performer legend.',
					'This multi-performer section differentiates inline vocals but its header does not identify the style slots. Add a performer legend, or remove the formatting if the section no longer needs performer differentiation.',
					[
						{
							kind: 'safe',
							label: 'Remove performer formatting',
							edit: {
								baseRevision: context.revision ?? 0,
								edits
							}
						}
					]
				)
			];
		});
	}
};
