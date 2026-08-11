/**
 * Finding a lookup in the guidance catalog, as plain functions so the index
 * page holds no logic of its own — the rule reference's own arrangement. The
 * search reuses `foldForSearch`/`searchTokens`, so accents, curly quotes and
 * case fold here exactly as they fold at `/rules/`: a reader who learned the
 * finder there has learned this one.
 *
 * The haystack per entry is what its topic page says about it — title,
 * statement, example, note, tier label — and per linter rule its title, so one
 * query answers across both halves of a topic: "question mark" lands on the
 * guidance entry and on `punctuation.question` alike.
 */
import { foldForSearch, searchTokens } from '$lib/rules/reference-search.js';
import { authorityLabels, type GuidanceEntry, type GuidanceTopic } from './guidance.js';

/** A linter rule drawn as a lookup row: what it is, what it says, where. */
export interface GuidanceLinterRule {
	id: string;
	title: string;
	/** The linter's own wording on the reviewed example — the row's second line. */
	message: string;
	slug: string;
}

export interface GuidanceTopicSection {
	topic: GuidanceTopic;
	entries: GuidanceEntry[];
	linterRules: GuidanceLinterRule[];
}

function entryHaystack(entry: GuidanceEntry): string {
	return foldForSearch(
		[
			entry.title,
			entry.statement,
			entry.example?.correct ?? '',
			entry.example?.incorrect ?? '',
			entry.note ?? '',
			authorityLabels[entry.authority]
		].join('\n')
	);
}

function matches(haystack: string, tokens: readonly string[]): boolean {
	return tokens.every((token) => haystack.includes(token));
}

/** Every token has to match, exactly as the rule reference narrows. */
export function filterGuidanceSections(
	sections: readonly GuidanceTopicSection[],
	query: string
): GuidanceTopicSection[] {
	const tokens = searchTokens(query);
	if (tokens.length === 0) {
		return [...sections];
	}
	return sections
		.map((section) => ({
			topic: section.topic,
			entries: section.entries.filter((entry) => matches(entryHaystack(entry), tokens)),
			linterRules: section.linterRules.filter((rule) =>
				matches(foldForSearch([rule.title, rule.message, rule.id].join('\n')), tokens)
			)
		}))
		.filter((section) => section.entries.length > 0 || section.linterRules.length > 0);
}

/** Entries and linter lookups counted together: the readout's one number. */
export function countGuidanceLookups(sections: readonly GuidanceTopicSection[]): number {
	return sections.reduce(
		(sum, section) => sum + section.entries.length + section.linterRules.length,
		0
	);
}
