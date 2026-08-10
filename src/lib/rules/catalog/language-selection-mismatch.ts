import { detectSongLanguage } from '$lib/languages/detect.js';
import { getLanguagePack, resolveLanguageTag } from '$lib/languages/registry.js';
import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic } from './utils.js';

export const languageSelectionMismatchRule: RuleDefinition = {
	id: 'language.selection-mismatch',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'none',
	sourceIds: ['T-LANGUAGE-DETECT'],
	// A product-safety diagnostic rather than a Genius policy claim: the citation
	// is tooling provenance, and the ruling about the mismatch is LyricLint's.
	derivation: true,
	// A language guessed from a half-typed document is a guess about a sample that
	// is still arriving.
	settlesOn: 'document',
	check(document, context) {
		const selectedTag = resolveLanguageTag(context.language);
		const detected = detectSongLanguage(document, context.language);
		if (!detected || detected.tag === selectedTag) return [];

		const selectedName = getLanguagePack(selectedTag).displayName;
		return [
			{
				...diagnostic(
					this,
					detected.range,
					`Lyrics appear to be ${detected.displayName}, but ${selectedName} is selected.`,
					'Language recognition runs locally using statistical text analysis. Review the selected lyric language; short, mixed-language, and transliterated songs may be inconclusive.'
				),
				detectedLanguage: {
					tag: detected.tag,
					displayName: detected.displayName
				}
			}
		];
	}
};
