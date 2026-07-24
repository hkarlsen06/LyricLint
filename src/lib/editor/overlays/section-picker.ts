import type { HeaderVocabulary, LanguagePack } from '../../core/types.js';

export interface SectionHeaderOption {
	label: string;
	headerName: string;
	ordinal?: number;
	custom?: boolean;
}

function headerTerms(pack: LanguagePack): string[] {
	const seen = new Set<string>();
	const terms: string[] = [];
	for (const vocabulary of pack.headers) {
		for (const term of vocabulary.terms) {
			const trimmed = term.trim();
			const key = trimmed.toLocaleLowerCase(pack.tag);
			if (trimmed && !seen.has(key)) {
				seen.add(key);
				terms.push(trimmed);
			}
		}
	}
	return terms;
}

export function suggestNextOrdinal(headerName: string, existingHeaders: readonly string[]): number {
	const escaped = headerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`^${escaped}(?:\\s+(\\d+))?$`, 'iu');
	let maximum = 0;
	for (const existing of existingHeaders) {
		const match = pattern.exec(existing.trim());
		if (match) {
			maximum = Math.max(maximum, Number.parseInt(match[1] ?? '1', 10));
		}
	}
	return Math.max(1, maximum + 1);
}

function isNumberedVocabulary(vocabulary: HeaderVocabulary): boolean {
	const semantic = vocabulary.semanticPart.toLocaleLowerCase();
	return semantic.includes('verse') || semantic.includes('part') || semantic.includes('section');
}

export function sectionHeaderOptions(
	pack: LanguagePack,
	existingHeaders: readonly string[],
	query: string
): SectionHeaderOption[] {
	const normalizedQuery = query.trim().toLocaleLowerCase(pack.tag);
	const numberedTerms = new Set(
		pack.headers
			.filter(isNumberedVocabulary)
			.flatMap((vocabulary) => vocabulary.terms.map((term) => term.toLocaleLowerCase(pack.tag)))
	);
	const options: SectionHeaderOption[] = headerTerms(pack)
		.map((headerName) => {
			const ordinal = numberedTerms.has(headerName.toLocaleLowerCase(pack.tag))
				? suggestNextOrdinal(headerName, existingHeaders)
				: undefined;
			return {
				label: ordinal && ordinal > 1 ? `${headerName} ${ordinal}` : headerName,
				headerName,
				ordinal: ordinal && ordinal > 1 ? ordinal : undefined
			};
		})
		.filter((option) => option.label.toLocaleLowerCase(pack.tag).includes(normalizedQuery));

	if (
		query.trim() &&
		!options.some((option) => option.label.toLocaleLowerCase(pack.tag) === normalizedQuery)
	) {
		options.push({
			label: `Use “${query.trim()}”`,
			headerName: query.trim(),
			custom: true
		});
	}

	return options;
}
