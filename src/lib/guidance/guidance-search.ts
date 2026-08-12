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
import type { Fixability, Severity } from '$lib/core/types.js';
import { getSource } from '$lib/rules/data/sources.js';
import { foldForSearch, searchTokens } from '$lib/rules/reference-search.js';
import {
	authorityLabels,
	guidanceTopicTitles,
	type GuidanceEntry,
	type GuidanceTopic
} from './guidance.js';

/** A linter rule drawn as a lookup row: what it is, what it says, where. */
export interface GuidanceLinterRule {
	id: string;
	title: string;
	/** The linter's own wording on the reviewed example — the row's second line. */
	message: string;
	slug: string;
	/** The rule's own severity, so the row wears the same meta it wears at /rules/. */
	severity: Severity;
	/** What the rule's example offers, in the rule index's own terms. */
	fixability: Fixability;
	/**
	 * A table-shaped rule's own search terms — every form and condition it
	 * checks, exactly as the rule index searches them — so `woah` finds the
	 * standardized-spellings row here the way it finds the rule at `/rules/`.
	 */
	lookupTerms?: string;
}

export interface GuidanceTopicSection {
	topic: GuidanceTopic;
	entries: GuidanceEntry[];
	linterRules: GuidanceLinterRule[];
}

/**
 * What the entry's topic page says about it, whole. The topic's own title and
 * the citations' titles were left out of the first version, and both omissions
 * were the lesson the rule reference already recorded about its own haystack:
 * a reader looking at the heading `Punctuation` typed it and lost every
 * guidance entry under that heading — only the linter rows survived, because
 * only their ids happened to carry the word. A claim about what a query would
 * or would not distinguish is a measurement, not a judgment.
 */
function entryHaystack(entry: GuidanceEntry): string {
	return foldForSearch(
		[
			guidanceTopicTitles[entry.topic],
			entry.title,
			entry.statement,
			entry.example?.correct ?? '',
			entry.example?.incorrect ?? '',
			entry.note ?? '',
			authorityLabels[entry.authority],
			...(entry.relatedRuleIds ?? []),
			...entry.sourceIds.map((id) => getSource(id)?.pageTitle ?? '')
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
				matches(
					foldForSearch(
						[
							guidanceTopicTitles[section.topic],
							rule.title,
							rule.message,
							rule.id,
							rule.lookupTerms ?? ''
						].join('\n')
					),
					tokens
				)
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
