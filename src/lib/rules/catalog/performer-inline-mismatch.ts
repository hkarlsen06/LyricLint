import type { RuleDefinition } from '$lib/core/types.js';
import { unaccountedStyledSlots } from '$lib/performers/legend-cleanup.js';
import { diagnostic } from './utils.js';

export const performerInlineMismatchRule: RuleDefinition = {
	id: 'performer.inline-mismatch',
	version: 3,
	defaultSeverity: 'suggestion',
	fixability: 'none',
	sourceIds: ['G-SECTIONS'],
	check(document) {
		return document.sections.flatMap((section) => {
			// A section with no legend at all is `performer.header-required`'s
			// finding — one header-anchored claim instead of one per voice — and a
			// transcriber working formatting-first with nobody named yet is not
			// nagged per styled span. Once a legend exists, a styled slot it does
			// not name is an unknown voice: one finding per slot, anchored on the
			// slot's first span, because the claim is about the voice rather than
			// about every passage it sings.
			if ((section.header?.legendGroups.length ?? 0) === 0) {
				return [];
			}
			return unaccountedStyledSlots(section).map(({ firstSpan }) =>
				diagnostic(
					this,
					firstSpan,
					'A styled voice is not yet named in the section legend.',
					'The styled lyrics mark a distinct voice the header does not identify. The formatting itself is worth keeping — it tells the reader, and the next transcriber, that a separate voice sings here. When the voice is known, choose the section voice and this styled voice to add the missing performer legend without changing the lyrics.'
				)
			);
		});
	}
};
