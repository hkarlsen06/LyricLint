import type { TextRange } from '#lib/core/types.js';
import { allocateId, type ConversionDocument, type LanguageRange } from './model.js';

/** Replace a passage's language ownership while retaining the surrounding ranges. */
export function replacePassageLanguages(
	document: ConversionDocument,
	range: TextRange,
	languages: readonly Omit<LanguageRange, 'id'>[]
): void {
	document.languageRanges = document.languageRanges.flatMap((entry) => {
		if (entry.to <= range.from || range.to <= entry.from) return [entry];
		return [
			...(entry.from < range.from ? [{ ...entry, to: range.from }] : []),
			...(range.to < entry.to
				? [
						{
							...entry,
							id: entry.from < range.from ? allocateId(document, 'language') : entry.id,
							from: range.to
						}
					]
				: [])
		];
	});
	for (const language of languages)
		document.languageRanges.push({ ...language, id: allocateId(document, 'language') });
	document.languageRanges.sort((a, b) => a.from - b.from);
}
