import type { RuleDefinition } from '../../core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

const soundWords =
	'(?:laughs?|laughing|sighs?|screams?|applause|gunshots?|door|phone|whistles?|snaps?|music)';
const exactSoundPattern = new RegExp(`^${soundWords}$`, 'iu');

export const soundEffectAsterisksRule: RuleDefinition = {
	id: 'sound-effect.asterisks',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SFX'],
	check(document, context) {
		const pattern = new RegExp(
			`(?:\\{(?<braceSound>${soundWords})\\}|\\[(?<bracketSound>${soundWords})\\])`,
			'giu'
		);
		return document.sections.flatMap((section) => {
			const diagnostics = section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, pattern).map((match) => {
					const sound =
						match.groups.braceSound ?? match.groups.bracketSound ?? match.text.slice(1, -1);
					const replacement = `*${sound}*`;
					return diagnostic(
						this,
						match,
						'Use asterisks around this likely sound effect.',
						'The braces wrap a recognized sound-effect phrase. Confirm the contextual classification before replacing the wrapper.',
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)]
					);
				})
			);
			const header = section.header;
			const headerSound = header?.rawNamePart.trim();
			if (header && headerSound && exactSoundPattern.test(headerSound)) {
				const replacement = `*${headerSound}*`;
				diagnostics.push(
					diagnostic(
						this,
						header,
						'This header looks like a sound effect that should use asterisks.',
						'The bracketed text matches recognized sound-effect vocabulary, so it may be notation rather than a section header. Confirm before replacing it.',
						[
							replacementFix(
								context,
								'preview',
								`Replace with ${replacement}`,
								header,
								replacement
							)
						]
					)
				);
			}
			return diagnostics;
		});
	}
};
