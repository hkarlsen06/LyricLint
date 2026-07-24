import type { RuleContext, RuleDefinition } from '../../core/types.js';
import { diagnostic } from './utils.js';

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
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'none',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
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
						'Performer identities belong in the section-header legend and are correlated through the four style slots. This line label is left unchanged for manual restructuring.'
					)
				];
			})
		);
	}
};
