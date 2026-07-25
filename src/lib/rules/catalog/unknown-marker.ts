import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

export const unknownMarkerRule: RuleDefinition = {
	id: 'unknown.marker',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'safe',
	sourceIds: ['G-UNKNOWN'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, /\(\s*\?+\s*\)|\[\s*\?{2,}\s*\]/gu).map((match) =>
					diagnostic(
						this,
						match,
						'Use [?] for an incomprehensible lyric.',
						'This is an exact recognized unknown marker, so replacing only the marker is mechanically safe.',
						[replacementFix(context, 'safe', 'Replace with [?]', match, '[?]')]
					)
				)
			)
		);
	}
};
