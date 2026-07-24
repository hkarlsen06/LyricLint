import type { Diagnostic, RuleDefinition } from '../../core/types.js';
import { diagnostic, matchesOutsideMarkup } from './utils.js';

export const repeatPlaceholderRule: RuleDefinition = {
	id: 'repeat.placeholder',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'none',
	sourceIds: ['G-REPEATS'],
	check(document) {
		const diagnostics: Diagnostic[] = [];
		for (const section of document.sections) {
			const header = section.header;
			if (header && /(?:\b(?:x|×)\s*\d+\b|\brepeat(?:ed)?\b)/iu.test(header.rawNamePart)) {
				const rawNameRange = {
					from: header.nameRange.from,
					to: header.nameRange.from + header.rawNamePart.length
				};
				diagnostics.push(
					diagnostic(
						this,
						rawNameRange,
						'Write repeated lyrics instead of a section-count placeholder.',
						'Repeated sections should contain the transcribed lyrics. The placeholder is preserved because expanding it requires the editor to choose the correct source section.'
					)
				);
			}
			for (const line of section.lines) {
				for (const match of matchesOutsideMarkup(
					line,
					/^\s*(?:repeat\s+(?:verse|chorus|refrain|hook|bridge)|(?:verse|chorus|refrain|hook|bridge)\s+(?:x|×)\s*\d+)\s*$/giu
				)) {
					diagnostics.push(
						diagnostic(
							this,
							match,
							'Write the repeated lyrics instead of this placeholder.',
							'The source asks transcribers to include repeated words. No automatic expansion is offered because the intended earlier section may be ambiguous.'
						)
					);
				}
			}
		}
		return diagnostics;
	}
};
