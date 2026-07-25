import type { RuleContext, RuleDefinition } from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';

function knownLabel(label: string, context: RuleContext): boolean {
	const normalized = label.trim().toLocaleLowerCase();
	if (/^(?:all|both|together|solo|duet|[a-z])$/iu.test(normalized)) {
		return true;
	}
	return context.performers.some(
		(performer) =>
			performer.displayName.toLocaleLowerCase() === normalized ||
			performer.aliases.some((alias) => alias.toLocaleLowerCase() === normalized)
	);
}

export const performerLineLabelForbiddenRule: RuleDefinition = {
	id: 'performer.line-label-forbidden',
	version: 2,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				// A line that is nothing but the label parses as a section header, so
				// every match here keeps a lyric behind the label it drops.
				const match = /^\s*\[([^\]\n]{1,80})\]\s+/u.exec(line.text);
				if (!match || !knownLabel(match[1] ?? '', context)) {
					return [];
				}
				const localFrom = match.index + match[0].indexOf('[');
				const range = {
					from: line.from + localFrom,
					to: line.from + localFrom + (match[1]?.length ?? 0) + 2
				};
				return [
					diagnostic(
						this,
						range,
						'Do not label individual lyric lines with bracketed performer names.',
						'Performer identities belong in the section-header legend and are correlated through the four style slots. Removing the label drops the attribution from the lyric, so name the performer in the section header and style the line to keep it.',
						[
							// The label and the space that separated it from the lyric go
							// together; any indentation in front of it is left alone.
							replacementFix(
								context,
								'preview',
								'Remove the line label',
								{ from: range.from, to: line.from + match.index + match[0].length },
								''
							)
						]
					)
				];
			})
		);
	}
};
