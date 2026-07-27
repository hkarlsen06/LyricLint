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

export const unknownUnresolvedRule: RuleDefinition = {
	id: 'unknown.unresolved',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'none',
	sourceIds: ['G-UNKNOWN'],
	check(document) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, /\[\?\]/gu).map((match) =>
					diagnostic(
						this,
						match,
						'Try to identify the lyric marked [?].',
						'Aim to transcribe all audible lyrics. Use [?] only when careful listening still cannot determine what is being sung.'
					)
				)
			)
		);
	}
};
