import type { Fixability, Severity } from '$lib/core/types.js';
import type { RuleReference, RuleReferenceGroup } from './reference.js';

/**
 * Finding a rule in the reference, kept as plain functions over the derived
 * reference so the index page's field and chips have no logic of their own.
 *
 * Fifty-two rules in nineteen groups is past what anyone reads down, and the
 * reader arriving here almost never knows the rule's name: they know the
 * symptom — a bracket, an apostrophe, a word the linter underlined. So the
 * query is matched against everything a page says, the reviewed examples
 * included, which is what makes searching “definately” or “Imma” land on the
 * rule that flagged it.
 */

/**
 * Severity and fixability in the order the chips offer them, worst-first and
 * most-automatic-first. Hard-coded rather than collected from the set: the two
 * axes have a canonical order that a run over the registry would replace with
 * whatever order the rules happen to be declared in.
 */
export const severityOrder: readonly Severity[] = [
	'error',
	'warning',
	'suggestion',
	'manual-review'
];

export const fixabilityOrder: readonly Fixability[] = ['safe', 'preview', 'none'];

/** What the rule's own example offers: the lead fix's kind, or nothing. */
export function ruleFixability(reference: RuleReference): Fixability {
	return reference.fix?.kind ?? 'none';
}

/**
 * Everything the query is matched against, folded once per rule.
 *
 * Deliberately not the severity or the fixability, which the chips own. A row
 * surfacing because the reader typed “warning” would be a second, invisible
 * control for the axis they can already see, and the two would disagree about
 * what the word means the first time a rule's explanation used it in a
 * sentence.
 */
function haystack(reference: RuleReference): string {
	return foldForSearch(
		[
			reference.title,
			reference.message,
			reference.explanation,
			reference.groupTitle,
			// Both spellings of the identifier: the ID as the workbench prints it,
			// and the slug as the URL spells it, so a reader who has one in front of
			// them can paste either.
			reference.id,
			reference.slug,
			reference.fix?.label ?? '',
			reference.invalid,
			reference.valid
		].join('\n')
	);
}

// `ruleReferences()` is derived once and cached, so a rule's haystack is a
// constant. Keyed by ID rather than by object identity because the entry is
// worth keeping for the life of the page either way.
const haystacks = new Map<string, string>();

function haystackFor(reference: RuleReference): string {
	let folded = haystacks.get(reference.id);
	if (folded === undefined) {
		folded = haystack(reference);
		haystacks.set(reference.id, folded);
	}
	return folded;
}

/**
 * One normal form for the query and for what it is matched against, so the
 * reader gets to type on the keyboard they have.
 *
 * Three folds, and each one answers a way this page's own text would otherwise
 * refuse an honest search:
 *
 * - **Combining marks come off.** `ça va` is the French rule's whole example,
 *   and nobody types the cedilla to look it up. Under NFD the mark is a
 *   separate character, so stripping `\p{M}` leaves `ca va` on both sides of
 *   the comparison. Hangul decomposes to jamo rather than to marks, so Korean
 *   survives this as its own decomposed form — which the query decomposes to as
 *   well, and the two still meet.
 * - **Typographic punctuation folds to the typewriter kind.** Half the messages
 *   here quote a word in curly quotes and several rules are *about* the
 *   apostrophe, so a reader typing `don't` on a plain keyboard has to be able
 *   to find `don’t`.
 * - **Case goes last**, and with `toLowerCase` rather than a locale-aware
 *   fold: the pages carry nine languages between them and there is no one
 *   locale to be right for.
 */
export function foldForSearch(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{M}+/gu, '')
		.replaceAll('’', "'")
		.replaceAll('‘', "'")
		.replaceAll('“', '"')
		.replaceAll('”', '"')
		.replaceAll('—', '-')
		.replaceAll('–', '-')
		.toLowerCase();
}

/**
 * The query as terms, all of which have to match. A reader typing two words
 * means both — `chorus link` is a request for the linking rule, not for every
 * rule that mentions a chorus.
 */
export function searchTokens(query: string): readonly string[] {
	return foldForSearch(query)
		.split(/\s+/u)
		.filter((token) => token.length > 0);
}

export interface RuleFilter {
	query: string;
	/**
	 * The severities and fixabilities on show, exactly as the linter panel's own
	 * chips work: a pressed chip is a severity the reader is looking at, and
	 * turning them all off shows nothing, which is the honest answer to having
	 * asked for nothing.
	 */
	severities: readonly Severity[];
	fixabilities: readonly Fixability[];
}

export const unfilteredRules: RuleFilter = {
	query: '',
	severities: severityOrder,
	fixabilities: fixabilityOrder
};

/** Whether anything is narrowing the list, which is what draws the readout. */
export function isFiltering(filter: RuleFilter): boolean {
	return (
		searchTokens(filter.query).length > 0 ||
		filter.severities.length !== severityOrder.length ||
		filter.fixabilities.length !== fixabilityOrder.length
	);
}

function matchesQuery(reference: RuleReference, tokens: readonly string[]): boolean {
	if (tokens.length === 0) return true;
	const folded = haystackFor(reference);
	return tokens.every((token) => folded.includes(token));
}

/**
 * The grouped index, narrowed. A group that keeps nothing is dropped rather
 * than left standing empty: a heading over no rows is a section the reader has
 * to read to discover is not for them.
 */
export function filterRuleGroups(
	groups: readonly RuleReferenceGroup[],
	filter: RuleFilter
): RuleReferenceGroup[] {
	const tokens = searchTokens(filter.query);
	const severities = new Set(filter.severities);
	const fixabilities = new Set(filter.fixabilities);
	const filtered: RuleReferenceGroup[] = [];
	for (const group of groups) {
		const rules = group.rules.filter(
			(rule) =>
				severities.has(rule.severity) &&
				fixabilities.has(ruleFixability(rule)) &&
				matchesQuery(rule, tokens)
		);
		if (rules.length > 0) filtered.push({ title: group.title, rules });
	}
	return filtered;
}

export function countRules(groups: readonly RuleReferenceGroup[]): number {
	return groups.reduce((total, group) => total + group.rules.length, 0);
}

/**
 * What each chip would show, counted over the *query's* result and blind to the
 * chips themselves — the linter panel counts its severities the same way, and
 * for the same reason. A count that also obeyed the chips would read as the
 * number of rows the chip is currently contributing, so pressing a chip back on
 * would be a press towards a zero, and the two rows of chips would chase each
 * other's numbers on every toggle. Read this way a chip's count is what
 * pressing it puts back.
 */
export function ruleCounts(
	groups: readonly RuleReferenceGroup[],
	query: string
): { severity: Record<Severity, number>; fixability: Record<Fixability, number> } {
	const tokens = searchTokens(query);
	const severity: Record<Severity, number> = {
		error: 0,
		warning: 0,
		suggestion: 0,
		'manual-review': 0
	};
	const fixability: Record<Fixability, number> = { safe: 0, preview: 0, none: 0 };
	for (const group of groups) {
		for (const rule of group.rules) {
			if (!matchesQuery(rule, tokens)) continue;
			severity[rule.severity] += 1;
			fixability[ruleFixability(rule)] += 1;
		}
	}
	return { severity, fixability };
}

/**
 * Which severities and fixabilities the rule set contains at all, so the chip
 * row offers no answer it cannot carry out — the same rule `availableRates` and
 * `spotifyAvailable` follow. This is counted over the whole set rather than
 * over the query: a chip that vanished as the reader typed would take the axis
 * with it, and a chip reading zero is what says their query excluded it.
 */
export function presentFacets(groups: readonly RuleReferenceGroup[]): {
	severities: Severity[];
	fixabilities: Fixability[];
} {
	const severities = new Set<Severity>();
	const fixabilities = new Set<Fixability>();
	for (const group of groups) {
		for (const rule of group.rules) {
			severities.add(rule.severity);
			fixabilities.add(ruleFixability(rule));
		}
	}
	return {
		severities: severityOrder.filter((severity) => severities.has(severity)),
		fixabilities: fixabilityOrder.filter((fixability) => fixabilities.has(fixability))
	};
}

/** What a fixability is called, in the words the rule's own page uses. */
export function fixabilityLabel(fixability: Fixability): string {
	switch (fixability) {
		case 'safe':
			return 'Automatic fix';
		case 'preview':
			return 'Previewed fix';
		case 'none':
			return 'No automatic fix';
	}
}
