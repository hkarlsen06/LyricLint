import { getLanguagePack, canLintHeaderLanguage } from '$lib/languages/registry.js';
import { headerNameIsEmpty } from '$lib/core/parser.js';
import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic } from './utils.js';

function headerSourceIds(language: string): string[] {
	const pack = getLanguagePack(language);
	if (!canLintHeaderLanguage(pack)) {
		return ['G-SECTIONS'];
	}
	return ['G-SECTIONS', ...pack.sourceIds];
}

export const sectionHeaderEmptyRule: RuleDefinition = {
	id: 'section.header-empty',
	version: 1,
	defaultSeverity: 'warning',
	// The picker, not a text fix. There is no wording to preview, because the
	// whole of what is missing is the one the user has not chosen yet — the same
	// reason `section.unlinked-repeat` opens a card rather than offering an edit.
	fixability: 'none',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		return document.sections.flatMap((section) => {
			const header = section.header;
			// A header still missing its closing bracket is
			// `syntax.unbalanced-brackets`' finding, and half of typing `[Verse 1]`
			// is spent in that state. Two cards over one line is the failure this
			// rule was added to end, not one to move somewhere else.
			if (!header || !header.closed || !headerNameIsEmpty(header)) {
				return [];
			}

			return [
				diagnostic(
					this,
					// From the *section*, not the header, and that is what makes one
					// picker serve both surfaces: the popover hands its diagnostic's
					// own `from` to the transform, and the panel selects the same
					// range and lets the caret's section answer. `insertSectionHeader`
					// keys on `section.from`, so an indented `  []` would otherwise
					// resolve from one path and be refused from the other.
					{ from: section.from, to: header.to },
					'This section header is empty.',
					'The brackets are here, but the song part they open is not named, so this line marks nothing. Choose a reviewed header for the language you are transcribing in — LyricLint writes the name between the brackets you already typed and leaves the rest of the line, a performer legend included, exactly as it is.',
					undefined,
					headerSourceIds(context.language)
				)
			];
		});
	}
};
