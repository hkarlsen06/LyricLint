import type { HeaderVocabulary, LanguagePack } from '$lib/core/types.js';
import { escapeRegExp, headerSemanticKey, semanticPartKey } from '$lib/languages/registry.js';

interface SectionHeaderOption {
	label: string;
	headerName: string;
	ordinal?: number;
	numberedHeaderTerms?: readonly string[];
	custom?: boolean;
}

interface HeaderCandidate {
	headerName: string;
	semanticPart: string;
	terms: readonly string[];
}

/**
 * Fixed song progression, with more common section types first at the same stage.
 * Flexible labels live with the intermediate passages. Aliases retain the language
 * pack's preferred order; neither draft contents nor search changes this sequence.
 */
const SECTION_ORDER: ReadonlyMap<string, number> = new Map(
	[
		'intro',
		'instrumentalintro',
		'verse',
		'part',
		'section',
		'prechorus',
		'build',
		'chorus',
		'refrain',
		'drop',
		'postchorus',
		'interlude',
		'instrumentalbreak',
		'instrumental',
		'nonlyricalvocals',
		'spoken',
		'skit',
		'segue',
		'bridge',
		'breakdown',
		'solo',
		'scatting',
		'outro',
		'instrumentaloutro'
	].map((semantic, index) => [semantic, index])
);

function headerCandidates(pack: LanguagePack): HeaderCandidate[] {
	const seen = new Set<string>();
	const candidates: HeaderCandidate[] = [];
	for (const vocabulary of pack.headers) {
		for (const term of vocabulary.terms) {
			const trimmed = term.trim();
			const key = trimmed.toLocaleLowerCase(pack.tag);
			if (trimmed && !seen.has(key)) {
				seen.add(key);
				candidates.push({
					headerName: trimmed,
					semanticPart: vocabulary.semanticPart,
					terms: vocabulary.terms
				});
			}
		}
	}
	return candidates;
}

export function suggestNextOrdinal(headerName: string, existingHeaders: readonly string[]): number {
	const escaped = escapeRegExp(headerName);
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

function suggestOrdinalAtPosition(
	pack: LanguagePack,
	candidate: HeaderCandidate,
	existingHeaders: readonly string[],
	headersBefore: readonly string[] | undefined
): number {
	if (!headersBefore) {
		return suggestNextOrdinal(candidate.headerName, existingHeaders);
	}

	const candidateSemantic = semanticPartKey(candidate.semanticPart);
	let maximumBefore = 0;
	for (const header of headersBefore) {
		if (headerSemanticKey(pack, header) !== candidateSemantic) {
			continue;
		}
		const ordinalMatch = /\s+(\d+)$/u.exec(header.trim());
		const ordinal = ordinalMatch ? Number.parseInt(ordinalMatch[1]!, 10) : 1;
		maximumBefore = Math.max(maximumBefore, ordinal);
	}
	return Math.max(1, maximumBefore + 1);
}

function isNumberedVocabulary(vocabulary: HeaderVocabulary): boolean {
	const semantic = vocabulary.semanticPart.toLocaleLowerCase();
	return semantic.includes('verse') || semantic.includes('part') || semantic.includes('section');
}

export function sectionHeaderOptions(
	pack: LanguagePack,
	existingHeaders: readonly string[],
	query: string,
	headersBefore?: readonly string[]
): SectionHeaderOption[] {
	const normalizedQuery = query.trim().toLocaleLowerCase(pack.tag);
	const numberedTerms = new Set(
		pack.headers
			.filter(isNumberedVocabulary)
			.flatMap((vocabulary) => vocabulary.terms.map((term) => term.toLocaleLowerCase(pack.tag)))
	);
	const options: SectionHeaderOption[] = headerCandidates(pack)
		.sort(
			(first, second) =>
				(SECTION_ORDER.get(semanticPartKey(first.semanticPart)) ?? SECTION_ORDER.size) -
				(SECTION_ORDER.get(semanticPartKey(second.semanticPart)) ?? SECTION_ORDER.size)
		)
		.map((candidate) => {
			const { headerName } = candidate;
			const ordinal = numberedTerms.has(headerName.toLocaleLowerCase(pack.tag))
				? suggestOrdinalAtPosition(pack, candidate, existingHeaders, headersBefore)
				: undefined;
			return {
				label: ordinal && ordinal > 1 ? `${headerName} ${ordinal}` : headerName,
				headerName,
				ordinal: ordinal && ordinal > 1 ? ordinal : undefined,
				numberedHeaderTerms:
					ordinal && ordinal > 1 ? candidate.terms.map((term) => term.trim()) : undefined
			} satisfies SectionHeaderOption;
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
