/**
 * Finding a lookup in the guidance catalog, as plain functions so the index
 * page holds no logic of its own — the rule reference's own arrangement. The
 * search reuses `foldForSearch`/`searchTokens`, so accents, curly quotes and
 * case fold here exactly as they fold at `/rules/`: a reader who learned the
 * finder there has learned this one.
 *
 * The haystack per entry is what its topic page says about it — title,
 * statement, example, note, tier label, the rule ids on its meta line — plus
 * the search terms of the rules it names, so a symptom query still answers
 * here: "question mark" lands on the unmarked-question entry through
 * `punctuation.question`'s own title, and `woah` lands on the spelling
 * entries through `spelling.standardized`'s table. The index used to draw a
 * row per linter rule and search those; the rows retired when every rule
 * became reachable through an entry's "Checked by" line, and their terms
 * folded in here so the finder did not get dumber with them.
 */
import { getSource } from '$lib/rules/data/sources.js';
import { foldForSearch, searchTokens } from '$lib/rules/reference-search.js';
import {
	authorityLabels,
	guidanceTopicTitles,
	type GuidanceEntry,
	type GuidanceTopic,
	type GuidanceTopicLandmark
} from './guidance.js';

export interface GuidanceTopicSection {
	topic: GuidanceTopic;
	entries: GuidanceEntry[];
	landmarks?: readonly GuidanceTopicLandmark[];
	/**
	 * Search terms for the rules this topic's entries and landmarks name —
	 * each rule's reader-facing title and, for a table-shaped rule, every form
	 * in its table — keyed by rule id. Derived from the server-only rule
	 * reference by the section layout's load, which is why it rides the
	 * section rather than being computed here.
	 */
	ruleTerms?: Record<string, string>;
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
function relatedRuleTerms(
	relatedRuleIds: readonly string[] | undefined,
	ruleTerms: Record<string, string> | undefined
): string[] {
	return (relatedRuleIds ?? []).flatMap((ruleId) => [ruleId, ruleTerms?.[ruleId] ?? '']);
}

function entryHaystack(entry: GuidanceEntry, ruleTerms?: Record<string, string>): string {
	return foldForSearch(
		[
			guidanceTopicTitles[entry.topic],
			entry.title,
			entry.statement,
			entry.example?.correct ?? '',
			entry.example?.incorrect ?? '',
			entry.note ?? '',
			authorityLabels[entry.authority],
			...relatedRuleTerms(entry.relatedRuleIds, ruleTerms),
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
			ruleTerms: section.ruleTerms,
			landmarks: section.landmarks?.filter((landmark) =>
				matches(
					foldForSearch(
						[
							guidanceTopicTitles[section.topic],
							landmark.title,
							landmark.statement,
							...relatedRuleTerms(landmark.relatedRuleIds, section.ruleTerms)
						].join('\n')
					),
					tokens
				)
			),
			entries: section.entries.filter((entry) =>
				matches(entryHaystack(entry, section.ruleTerms), tokens)
			)
		}))
		.filter((section) => (section.landmarks?.length ?? 0) > 0 || section.entries.length > 0);
}

/** Entries and landmarks counted together: the readout's one number. */
export function countGuidanceLookups(sections: readonly GuidanceTopicSection[]): number {
	return sections.reduce(
		(sum, section) => sum + (section.landmarks?.length ?? 0) + section.entries.length,
		0
	);
}
