import type { RuleDefinition } from '$lib/core/types.js';
import { getLanguagePack } from '$lib/languages/registry.js';
import { diagnostic, replacementFix } from './utils.js';

export const sectionDeprecatedHookRule: RuleDefinition = {
	id: 'section.deprecated-hook',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SECTION-HOOK'],
	check(document, context) {
		const selectedPack = getLanguagePack(context.language);
		const selectedTerms = new Set(
			selectedPack.headers.flatMap((header) =>
				header.terms.map((term) => term.trim().toLocaleLowerCase(selectedPack.tag))
			)
		);
		return document.sections.flatMap((section) => {
			const header = section.header;
			if (
				!header ||
				header.namePart.trim().toLocaleLowerCase(selectedPack.tag) !== 'hook' ||
				selectedTerms.has('hook')
			)
				return [];
			return [
				diagnostic(
					this,
					header.nameRange,
					'The [Hook] section name is deprecated.',
					'The current Genius section guide replaces [Hook] with [Chorus] or [Refrain]. Choose the term that matches the song structure.',
					[
						replacementFix(context, 'preview', 'Replace with Chorus', header.nameRange, 'Chorus'),
						replacementFix(context, 'preview', 'Replace with Refrain', header.nameRange, 'Refrain')
					]
				)
			];
		});
	}
};
