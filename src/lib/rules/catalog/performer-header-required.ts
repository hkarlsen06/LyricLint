import type { RuleDefinition, Section, TextEdit } from '$lib/core/types.js';
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
	version: 3,
	defaultSeverity: 'suggestion',
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
					'Styled vocals are not yet named in a performer legend.',
					'This section differentiates inline voices, but its header does not yet say who they are. The formatting is worth keeping until the voices are known — it tells the next transcriber a distinct voice sings here. Add a performer legend when the voices are identified, or remove the formatting only if the section no longer needs differentiation.',
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
