import type { HeaderVocabulary, LanguagePack } from '$lib/core/types.js';
import { escapeRegExp, headerSemanticKey, semanticPartKey } from '$lib/languages/registry.js';

interface SectionHeaderOption {
	label: string;
	headerName: string;
	ordinal?: number;
	numberedHeaderTerms?: readonly string[];
	custom?: boolean;
}

export interface SectionHeaderNeighbors {
	previousHeader?: string;
	nextHeader?: string;
	headersBefore?: readonly string[];
}

interface HeaderCandidate {
	headerName: string;
	semanticPart: string;
	terms: readonly string[];
	order: number;
}

/**
 * A map rather than an object: the key is whatever `semanticPartKey` makes of a
 * pack's own term, so the lookup is genuinely open and `.get()` is what says so.
 */
const SEMANTIC_PRIORITIES: ReadonlyMap<string, number> = new Map([
	['verse', 100],
	['chorus', 94],
	['refrain', 90],
	['prechorus', 82],
	['postchorus', 74],
	['bridge', 68],
	['intro', 62],
	['part', 58],
	['section', 58],
	['breakdown', 56],
	['instrumentalbreak', 52],
	['interlude', 50],
	['solo', 48],
	['instrumental', 46],
	['build', 44],
	['drop', 42],
	['outro', 40]
]);

const SINGLE_USE_SEMANTICS = new Set(['intro', 'outro']);

const semanticKey = semanticPartKey;

function structuralFamily(semantic: string | undefined): string | undefined {
	if (semantic === 'chorus' || semantic === 'refrain') {
		return 'chorus';
	}
	return semantic;
}

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
					terms: vocabulary.terms,
					order: candidates.length
				});
			}
		}
	}
	return candidates;
}

const semanticForHeader = headerSemanticKey;

function semanticCounts(
	pack: LanguagePack,
	existingHeaders: readonly string[]
): ReadonlyMap<string, number> {
	const counts = new Map<string, number>();
	for (const existingHeader of existingHeaders) {
		const key = semanticForHeader(pack, existingHeader);
		if (!key) {
			continue;
		}
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

function transitionScore(
	semanticPart: string,
	previousSemantic: string | undefined,
	nextSemantic: string | undefined
): number {
	const candidate = structuralFamily(semanticKey(semanticPart));
	const previous = structuralFamily(previousSemantic);
	const next = structuralFamily(nextSemantic);
	let score = 0;

	// Immediate neighbors are stronger evidence than song-wide frequency.
	if (previous === candidate) {
		score -= candidate === 'verse' ? 25 : 70;
	}
	if (next === candidate) {
		score -= candidate === 'verse' ? 25 : 70;
	}

	if (previous === 'intro' && candidate === 'verse') {
		score += 70;
	}
	if (previous === 'verse') {
		if (candidate === 'prechorus') {
			score += 55;
		} else if (candidate === 'chorus') {
			score += 35;
		}
	}
	if (previous === 'prechorus' && candidate === 'chorus') {
		score += 85;
	}
	if (previous === 'chorus') {
		if (candidate === 'verse') {
			score += 60;
		} else if (candidate === 'postchorus') {
			score += 50;
		} else if (candidate === 'bridge') {
			score += 25;
		}
	}
	if (previous === 'postchorus') {
		if (candidate === 'verse') {
			score += 50;
		} else if (candidate === 'bridge') {
			score += 25;
		}
	}
	if (previous === 'bridge' && candidate === 'chorus') {
		score += 65;
	}

	if (next === 'chorus') {
		if (candidate === 'prechorus') {
			score += 80;
		} else if (candidate === 'verse') {
			score += 25;
		} else if (candidate === 'bridge') {
			score += 35;
		}
	}
	if (next === 'prechorus' && candidate === 'verse') {
		score += 50;
	}
	if (next === 'outro' && candidate === 'chorus') {
		score += 30;
	}

	// The strongest common sandwich: Verse → missing section → Chorus.
	if (previous === 'verse' && next === 'chorus' && candidate === 'prechorus') {
		score += 40;
	}

	return score;
}

function likelihoodScore(
	semanticPart: string,
	counts: ReadonlyMap<string, number>,
	hasExistingHeaders: boolean,
	previousSemantic: string | undefined,
	nextSemantic: string | undefined
): number {
	const key = semanticKey(semanticPart);
	const count = counts.get(key) ?? 0;
	let score = SEMANTIC_PRIORITIES.get(key) ?? 30;

	if (!hasExistingHeaders && key === 'intro') {
		score += 60;
	}
	if (SINGLE_USE_SEMANTICS.has(key) && count > 0) {
		score -= 140;
	} else if (count > 0) {
		// A song is more likely to repeat section types that already establish
		// its structure. Cap the boost so uncommon repeated labels do not crowd
		// out universally useful choices.
		score += Math.min(count, 3) * 20;
	}

	return score + transitionScore(semanticPart, previousSemantic, nextSemantic);
}

function queryMatchScore(
	option: SectionHeaderOption,
	normalizedQuery: string,
	tag: string
): number {
	if (!normalizedQuery) {
		return 0;
	}
	const label = option.label.toLocaleLowerCase(tag);
	const headerName = option.headerName.toLocaleLowerCase(tag);
	if (label === normalizedQuery || headerName === normalizedQuery) {
		return 3;
	}
	if (label.startsWith(normalizedQuery) || headerName.startsWith(normalizedQuery)) {
		return 2;
	}
	return 1;
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

	const candidateSemantic = semanticKey(candidate.semanticPart);
	let maximumBefore = 0;
	for (const header of headersBefore) {
		if (semanticForHeader(pack, header) !== candidateSemantic) {
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
	neighbors: SectionHeaderNeighbors = {}
): SectionHeaderOption[] {
	const normalizedQuery = query.trim().toLocaleLowerCase(pack.tag);
	const counts = semanticCounts(pack, existingHeaders);
	const previousSemantic = semanticForHeader(pack, neighbors.previousHeader);
	const nextSemantic = semanticForHeader(pack, neighbors.nextHeader);
	const numberedTerms = new Set(
		pack.headers
			.filter(isNumberedVocabulary)
			.flatMap((vocabulary) => vocabulary.terms.map((term) => term.toLocaleLowerCase(pack.tag)))
	);
	const options: SectionHeaderOption[] = headerCandidates(pack)
		.map((candidate) => {
			const { headerName } = candidate;
			const ordinal = numberedTerms.has(headerName.toLocaleLowerCase(pack.tag))
				? suggestOrdinalAtPosition(pack, candidate, existingHeaders, neighbors.headersBefore)
				: undefined;
			return {
				option: {
					label: ordinal && ordinal > 1 ? `${headerName} ${ordinal}` : headerName,
					headerName,
					ordinal: ordinal && ordinal > 1 ? ordinal : undefined,
					numberedHeaderTerms:
						ordinal && ordinal > 1 ? candidate.terms.map((term) => term.trim()) : undefined
				} satisfies SectionHeaderOption,
				likelihood: likelihoodScore(
					candidate.semanticPart,
					counts,
					existingHeaders.length > 0,
					previousSemantic,
					nextSemantic
				),
				order: candidate.order
			};
		})
		.filter(({ option }) => option.label.toLocaleLowerCase(pack.tag).includes(normalizedQuery))
		.sort((first, second) => {
			const matchDifference =
				queryMatchScore(second.option, normalizedQuery, pack.tag) -
				queryMatchScore(first.option, normalizedQuery, pack.tag);
			return matchDifference || second.likelihood - first.likelihood || first.order - second.order;
		})
		.map(({ option }) => option);

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
