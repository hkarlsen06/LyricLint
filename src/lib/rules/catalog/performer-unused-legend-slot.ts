import { cleanupLegendSlots } from '../../performers/legend-cleanup.js';
import type { Diagnostic, RuleDefinition } from '../../core/types.js';
import { diagnostic } from './utils.js';

export const performerUnusedLegendSlotRule: RuleDefinition = {
	id: 'performer.unused-legend-slot',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'safe',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (const section of document.sections) {
			const edit = cleanupLegendSlots({ ...document, sections: [section] })[0];
			if (!edit || !section.header) {
				continue;
			}
			diagnostics.push(
				diagnostic(
					this,
					{ from: edit.from, to: edit.to },
					'This performer slot is not used in the section.',
					'The section legend should describe the performer styles that actually occur in its lyrics. Remove the unused slot to keep the header and formatting in sync.',
					[
						{
							kind: 'safe',
							label: 'Remove unused performer slot',
							edit: {
								baseRevision: context.revision ?? 0,
								edits: [edit]
							}
						}
					]
				)
			);
		}
		return diagnostics;
	}
};
