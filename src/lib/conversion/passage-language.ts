import type { TextRange } from '#lib/core/types.js';
import { allocateId, type ConversionDocument, type LanguageRange } from './model.js';

/** Replace disjoint passages while retaining the surrounding and hidden language ownership. */
export function replacePassageLanguages(
	document: ConversionDocument,
	ranges: readonly TextRange[],
	languages: readonly Omit<LanguageRange, 'id'>[]
): void {
	const selected = [...ranges].sort((a, b) => a.from - b.from);
	document.languageRanges = document.languageRanges.flatMap((entry) => {
		let lower = 0;
		let upper = selected.length;
		while (lower < upper) {
			const middle = (lower + upper) >>> 1;
			if (selected[middle]!.to <= entry.from) lower = middle + 1;
			else upper = middle;
		}
		if (!selected[lower] || entry.to <= selected[lower].from) return [entry];
		const kept: LanguageRange[] = [];
		let at = entry.from;
		for (let index = lower; index < selected.length && selected[index]!.from < entry.to; index++) {
			const range = selected[index]!;
			if (at < range.from) kept.push({ ...entry, from: at, to: range.from });
			at = Math.max(at, range.to);
		}
		if (at < entry.to) kept.push({ ...entry, from: at });
		return kept.map((piece, index) =>
			index === 0 ? piece : { ...piece, id: allocateId(document, 'language') }
		);
	});
	for (const language of languages)
		document.languageRanges.push({ ...language, id: allocateId(document, 'language') });
	document.languageRanges.sort((a, b) => a.from - b.from);
}
