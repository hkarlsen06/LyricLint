import type { Fixability, Severity } from '$lib/core/types.js';
import type { RuleReference, RuleReferenceGroup } from './reference.js';

/**
 * Finding a rule in the reference, kept as plain functions over the derived
 * reference so the index page's field and chips have no logic of their own.
 *
 * Fifty-two rules in nineteen groups is past what anyone reads down, and the
 * reader arriving here almost never knows the rule's name: they know the
 * symptom — a bracket, an apostrophe, a word the linter underlined. So the
 * query is matched against everything a page says, the reviewed examples and
 * the lookup tables included, which is what makes searching “definately”,
 * “Imma” or “tryna” land on the rule that flagged it.
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

/**
 * Dots cannot appear in a static-adapter path segment — the adapter writes the
 * page to disk and `adlib.parentheses` reads as a file named `adlib` with the
 * extension `parentheses`. Hyphens also match the catalog filenames, so a slug
 * doubles as the name of the module implementing it. Here rather than in
 * `reference.ts` because the guidelines pages link rules from the browser, and
 * that module pulls the parser and the whole registry with it.
 */
export function ruleSlug(id: string): string {
	return id.replaceAll('.', '-');
}

/** What the rule's own example offers: the lead fix's kind, or nothing. */
export function ruleFixability(reference: RuleReference): Fixability {
	return reference.fix?.kind ?? 'none';
}

/**
 * The handful of rules a reader most often arrives here for, drawn again as a
 * short block at the head of the index.
 *
 * `groupOrder` in `reference.ts` gets the right family onto the first screen;
 * this gets the right *rows* onto it. Section headers is eleven rules deep, so
 * ranking it first still opens the page on eleven headings' worth of scrolling
 * before the reader meets a spelling — and the two conventions a first-time
 * transcriber actually has to be told are one rule from each end of that.
 *
 * Curated, not counted, exactly as `groupOrder` is and for the same reason:
 * nothing here measures anything. What these six have in common is that each is
 * a Genius convention somebody has to be *told* — brackets around a song part,
 * a legend before a styled voice, `[?]` for a lyric nobody could make out — as
 * opposed to a rule whose own message is the whole of what there is to know
 * about it. `capitalization.line-start` is deliberately absent for that reason,
 * and it would otherwise be an obvious member.
 *
 * Six, and that is a ceiling rather than a round number: this block costs the
 * real index its own place on the first screen, and past about six it *is* the
 * first screen, which defeats a shortcut into a list.
 *
 * It is drawn only while nothing is narrowing the list. A search is the reader
 * saying what they are looking for, and a duplicated shortcut standing over
 * their answer is noise — it would also put six rows in front of a readout that
 * counts a different number.
 */
export const popularRuleIds: readonly string[] = [
	'section.header-missing',
	'section.header-prose',
	'performer.header-required',
	'spelling.standardized',
	'punctuation.line-ending',
	'unknown.marker'
];

/**
 * `popularRuleIds` resolved against the index, in the order declared there. A
 * rule that has left the catalog is skipped rather than thrown for — losing a
 * shortcut is not worth failing a page render over, and `reference-search.test.ts`
 * is what turns a stale ID into a failure where somebody can see it.
 */
export function popularRules(groups: readonly RuleReferenceGroup[]): RuleReference[] {
	const byId = new Map(groups.flatMap((group) => group.rules).map((rule) => [rule.id, rule]));
	return popularRuleIds.flatMap((id) => {
		const rule = byId.get(id);
		return rule ? [rule] : [];
	});
}

/**
 * Everything the query is matched against, folded once per rule.
 *
 * The list is the rule's own page read top to bottom — its name, the linter's
 * wording, the explanation, both reviewed examples, the fix's label, the
 * citations under them, and for a table-shaped rule the table's prose and every
 * form in it. That is the whole of what the reader can see, which is the only
 * definition of "searchable" that does not have to be re-argued every time a
 * page grows a section.
 *
 * **The citations were left out once, and the argument for it was wrong by an
 * amount that could have been measured.** The reasoning was that all 60 rules
 * cite the same handful of Genius pages, so a citation term would group the
 * index rather than narrow it. They do not: the most-cited page title covers 18
 * rules and is `Use song part headers`, which landing on the eighteen header
 * rules is a correct answer rather than a grouping; every other title covers
 * three or fewer, and the 47 distinct section titles are as specific as
 * `Reviewed Norwegian section-header vocabulary`. What it actually cost was a
 * reader typing `languages` at a page whose citation reads `Song Headers in
 * Different Languages` and being told no rule matches — the exact distrust that
 * widening this list exists to prevent.
 *
 * What stays out is **severity and fixability**, which the chips own. A row
 * surfacing because the reader typed “warning” would be a second, invisible
 * control for an axis they can already see, and the two would disagree about
 * what the word means the first time a rule's explanation used it in a
 * sentence. The page's boilerplate about a fix goes with them: “resolving it is
 * a judgment call” is the same sentence on every rule that has none, so it is
 * the fixability chip wearing words.
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
			reference.valid,
			// What the rule cites, in both the words the block draws: the page and
			// the part of it that was reviewed. Already on the reference — every
			// page lists them — so this costs the payload nothing.
			...reference.sources.flatMap((source) => [source.pageTitle, source.sectionTitle]),
			// Every form in the rule's table, where it has one. Without this the
			// example is all a table-shaped rule is searchable by, so `Imma` found
			// `spelling.standardized` while `tryna` — one of its other 28 entries —
			// found nothing at all, which reads as the reference not covering it.
			reference.lookupTerms ?? '',
			// The guideline titles the page links under its explanation — what is
			// searchable is what the page says, and these are on it.
			...(reference.guidelines ?? []).map((guideline) => guideline.title)
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
 * - **And the Greek final sigma folds to the ordinary one**, which is the one
 *   place `toLowerCase` is not a per-character operation: it implements
 *   `Final_Sigma`, so `ΛΟΓΟΣ` lowercases to `λογος` as a whole string and to
 *   `λογοσ` a character at a time. `foldWithOffsets` below runs it a character
 *   at a time by construction, so without this the two folds disagree — the
 *   query matches the filter and the page it opens draws no `<mark>`, which is
 *   the failure marking the query exists to prevent. It runs after the case
 *   fold, where both spellings have arrived, and costs the offsets nothing:
 *   one code unit for one.
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
		.toLowerCase()
		.replaceAll('ς', 'σ');
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

/**
 * The same fold, kept alongside where each of its characters came from.
 *
 * Marking the query inside the page it opened is the one job the plain fold
 * cannot do: it changes the string's length in three separate ways — NFD splits
 * a letter into a letter and a mark, the mark is then dropped, and a few
 * characters lowercase to more than one — so an offset found in the folded text
 * names nothing in the text on screen. `ça` folds to `ca`, and a match at
 * folded 0..2 is two characters of a three-character string.
 *
 * So the fold runs one source character at a time and records, per folded code
 * unit, the span of the character that produced it. A match then resolves to
 * the first source character's start and the last one's end, which is what
 * makes a highlight land on whole characters: half of a `ç` is not a thing a
 * `<mark>` can hold, and a combining mark between two matched letters is
 * carried along by the range being contiguous rather than by being matched.
 *
 * Code units rather than code points, because `indexOf` counts in code units
 * and the two disagree the moment an example carries an emoji or a rare CJK
 * character.
 */
interface FoldedWithOffsets {
	folded: string;
	/** Where in the original the character behind each folded unit begins. */
	starts: number[];
	/** Where that character ends. */
	ends: number[];
}

function foldWithOffsets(text: string): FoldedWithOffsets {
	const starts: number[] = [];
	const ends: number[] = [];
	let folded = '';
	let at = 0;
	while (at < text.length) {
		const source = String.fromCodePoint(text.codePointAt(at)!);
		const end = at + source.length;
		const piece = foldForSearch(source);
		for (let unit = 0; unit < piece.length; unit += 1) {
			starts.push(at);
			ends.push(end);
		}
		folded += piece;
		at = end;
	}
	return { folded, starts, ends };
}

/**
 * One row of the index: a rule, or the several rules that are one convention
 * per language pack.
 */
interface RuleIndexFamily {
	kind: 'family';
	family: string;
	rules: RuleReference[];
}

type RuleIndexEntry = { kind: 'rule'; rule: RuleReference } | RuleIndexFamily;

/**
 * A group's rules as the rows the index actually draws.
 *
 * Eight of the eleven rules in the Spelling family are one rule per language
 * pack, and they look alike in the index because they are alike. A transcriber
 * works in one language, so seven of those eight rows are noise to every reader
 * who ever sees them — and it is the second group on the page, which means the
 * repetition lands on the first screen of a reader who came to find out what
 * the conventions are.
 *
 * Only the *drawing* collapses. `groupedRuleReferences()` stays exhaustive, so
 * the sitemap, the prerender entries, the structured data and the search all
 * still see all 60 rules and every `/rules/<slug>/` URL is untouched.
 *
 * Two things it owes:
 *
 * - **A family takes the position of its first member**, so collapsing never
 *   reorders the group around it. Within the row the languages keep the
 *   registry's order for the same reason.
 * - **A family of one draws as an ordinary rule row.** Under a query that keeps
 *   only the Norwegian rule, a family row would be a heading over a single
 *   link — one press wearing two rows — which is the same complaint `Fix all 1`
 *   answers in the workbench. The rule's own row says more, because it carries
 *   the message and the severity.
 */
export function ruleIndexEntries(rules: readonly RuleReference[]): RuleIndexEntry[] {
	const entries: RuleIndexEntry[] = [];
	// The row itself is what the map holds, so a later member of the same family
	// is appended to the row already standing in `entries` at its first member's
	// position — no second lookup, and nothing to assert about what sits there.
	const rows = new Map<string, RuleIndexFamily>();
	for (const rule of rules) {
		const family = rule.variant?.family;
		if (family === undefined) {
			entries.push({ kind: 'rule', rule });
			continue;
		}
		const row = rows.get(family);
		if (row === undefined) {
			const added: RuleIndexFamily = { kind: 'family', family, rules: [rule] };
			rows.set(family, added);
			entries.push(added);
			continue;
		}
		row.rules.push(rule);
	}
	return entries.map((entry) =>
		entry.kind === 'family' && entry.rules.length === 1
			? { kind: 'rule', rule: entry.rules[0]! }
			: entry
	);
}

/** A run of the original text that one of the query's terms matched. */
export interface TextRange {
	from: number;
	to: number;
}

/**
 * Where the query's terms sit in a piece of the page, merged.
 *
 * Every term is marked rather than only the first, because every term had to
 * match for the rule to be listed at all — showing one of them would answer
 * half the question the reader is asking by having the page open. Overlapping
 * and touching runs are merged so two terms that met in the middle of a word
 * are one mark rather than two abutting ones with a seam between them.
 */
function highlightRanges(text: string, tokens: readonly string[]): TextRange[] {
	if (tokens.length === 0 || text.length === 0) return [];
	const { folded, starts, ends } = foldWithOffsets(text);
	const found: TextRange[] = [];
	for (const token of tokens) {
		let at = folded.indexOf(token);
		while (at >= 0) {
			found.push({ from: starts[at]!, to: ends[at + token.length - 1]! });
			// From the next unit rather than past the match, so `aa` in `aaa` is
			// found twice and the two are merged into the one run they look like.
			at = folded.indexOf(token, at + 1);
		}
	}
	if (found.length === 0) return [];
	found.sort((a, b) => a.from - b.from || a.to - b.to);
	const merged: TextRange[] = [found[0]!];
	for (const range of found.slice(1)) {
		const last = merged[merged.length - 1]!;
		if (range.from <= last.to) last.to = Math.max(last.to, range.to);
		else merged.push(range);
	}
	return merged;
}

/** A piece of text, and whether the query is why it is being pointed at. */
interface TextSegment {
	text: string;
	match: boolean;
}

/**
 * A string cut into what the query matched and what it did not, ready to be
 * rendered as text and `<mark>`s.
 *
 * Empty text produces no segments at all rather than one empty one, so a
 * component rendering these draws nothing for a field a rule does not carry.
 */
export function highlightSegments(text: string, tokens: readonly string[]): TextSegment[] {
	if (text.length === 0) return [];
	const ranges = highlightRanges(text, tokens);
	if (ranges.length === 0) return [{ text, match: false }];
	const segments: TextSegment[] = [];
	let at = 0;
	for (const range of ranges) {
		if (range.from > at) segments.push({ text: text.slice(at, range.from), match: false });
		segments.push({ text: text.slice(range.from, range.to), match: true });
		at = range.to;
	}
	if (at < text.length) segments.push({ text: text.slice(at), match: false });
	return segments;
}

interface RuleFilter {
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
		if (rules.length > 0) filtered.push({ group: group.group, title: group.title, rules });
	}
	return filtered;
}

export function countRules(groups: readonly RuleReferenceGroup[]): number {
	return groups.reduce((total, group) => total + group.rules.length, 0);
}

/** One number per chip, on each of the index's two axes. */
export interface RuleFacetCounts {
	severity: Record<Severity, number>;
	fixability: Record<Fixability, number>;
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
export function ruleCounts(groups: readonly RuleReferenceGroup[], query: string): RuleFacetCounts {
	const tokens = searchTokens(query);
	const severity = {
		error: 0,
		warning: 0,
		suggestion: 0,
		'manual-review': 0
	} satisfies Record<Severity, number>;
	const fixability = { safe: 0, preview: 0, none: 0 } satisfies Record<Fixability, number>;
	for (const group of groups) {
		for (const rule of group.rules) {
			if (!matchesQuery(rule, tokens)) continue;
			severity[rule.severity] += 1;
			fixability[ruleFixability(rule)] += 1;
		}
	}
	return { severity, fixability };
}

/** Which chips the index offers at all, in each axis's own order. */
export interface PresentRuleFacets {
	severities: Severity[];
	fixabilities: Fixability[];
}

/**
 * Which severities and fixabilities the rule set contains at all, so the chip
 * row offers no answer it cannot carry out — the same rule `availableRates` and
 * `spotifyAvailable` follow. This is counted over the whole set rather than
 * over the query: a chip that vanished as the reader typed would take the axis
 * with it, and a chip reading zero is what says their query excluded it.
 */
export function presentFacets(groups: readonly RuleReferenceGroup[]): PresentRuleFacets {
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
