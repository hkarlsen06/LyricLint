import { describe, expect, it } from 'vitest';
import {
	countRules,
	filterRuleGroups,
	fixabilityLabel,
	fixabilityOrder,
	foldForSearch,
	highlightSegments,
	isFiltering,
	popularRuleIds,
	popularRules,
	presentFacets,
	ruleCounts,
	ruleFixability,
	searchTokens,
	severityOrder,
	unfilteredRules
} from './reference-search.js';
import { groupedRuleReferences } from './reference.js';

const groups = groupedRuleReferences();

/** Every rule left by a filter, flattened to IDs for readable assertions. */
function idsFor(query: string, overrides: Partial<typeof unfilteredRules> = {}): string[] {
	return filterRuleGroups(groups, { ...unfilteredRules, query, ...overrides }).flatMap((group) =>
		group.rules.map((rule) => rule.id)
	);
}

describe('rule reference search', () => {
	it('leaves the whole index standing when nothing is asked for', () => {
		const unfiltered = filterRuleGroups(groups, unfilteredRules);
		expect(unfiltered).toEqual(groups);
		expect(countRules(unfiltered)).toBe(countRules(groups));
		expect(isFiltering(unfilteredRules)).toBe(false);
	});

	it('matches the rule’s written title', () => {
		expect(idsFor('link repeated')).toEqual(['section.unlinked-repeat']);
	});

	it('matches the reviewed example, which is how a reader arrives here', () => {
		// The word the linter underlined is the thing the reader has in front of
		// them, and it appears nowhere but the example on most of these pages.
		expect(idsFor('definately')).toEqual(['spelling.english-common']);
		expect(idsFor('Imma')).toEqual(['spelling.standardized']);
	});

	it('matches any form in a rule’s lookup table, not just the one in its example', () => {
		// The example is one row of a table with 29 in it, and for a long time it
		// was the only row the search could see — so `Imma` found the rule and
		// `tryna` found nothing, which reads as the reference not covering it.
		expect(idsFor('tryna')).toEqual(['spelling.standardized']);
		expect(idsFor('bougie')).toEqual(['spelling.standardized']);
		expect(idsFor('skrrt')).toEqual(['spelling.standardized']);
		// A curated misspelling is searchable too: it is what the reader typed.
		expect(idsFor('tryina')).toEqual(['spelling.standardized']);
		// Matching is substring, so a short form legitimately lands on more than
		// one rule — `couse` is inside `becouse`, which another table also carries.
		// Both rows are true answers, so this widens rather than misfires.
		expect(idsFor('couse')).toEqual(['spelling.standardized', 'spelling.english-common']);
		// And the other tables, whose examples name one token each.
		expect(idsFor('tmrw')).toEqual(['spelling.texting-shorthand']);
		expect(idsFor('wouldnt')).toEqual(['contraction.apostrophe']);
		expect(idsFor('untill')).toEqual(['spelling.english-common']);
	});

	it('matches what a rule cites, which the page draws in full', () => {
		// The specific complaint: `section.localized-header-preference` cites
		// `Song Headers in Different Languages`, in a link the reader is looking
		// at, and typing the word in it answered `No rule matches this search`.
		const cited = idsFor('languages');
		expect(cited).toContain('section.localized-header-preference');
		// It widens rather than groups, which is the thing this was left out for
		// on an assumption nobody measured. When it was measured, the most-cited
		// page covered a third of the catalog — the header rules, a correct
		// answer — and every other title covered three or fewer; the assertion
		// below is the half of that worth pinning against a growing catalog.
		expect(cited.length).toBeLessThan(countRules(groups) / 2);
		// And the reviewed part of the page, which is the more specific of the two
		// strings a citation draws — three rules read that vocabulary and all
		// three are true answers to having typed it.
		expect(idsFor('norwegian section-header vocabulary')).toEqual([
			'section.header-language',
			'section.localized-header-preference',
			'section.header-unrecognized'
		]);
	});

	it('matches the prose a table-shaped rule’s page is mostly made of', () => {
		// For these eight rules the table *is* the page, so the conditions written
		// down its rows are most of what the reader is looking at — and for a long
		// time none of it was reachable by typing the words in it. A search that
		// answers for a page's headings and not for its body is one the reader
		// learns to distrust.
		expect(idsFor('cousin')).toEqual(['spelling.standardized']);
		// The name of the mark, which the table writes on the row for it and
		// nowhere else on the page. `quotation mark` alone is a fair match for
		// `punctuation.line-ending` as well, which is the filter widening honestly
		// rather than misfiring.
		expect(idsFor('closing curly single')).toEqual(['quotes.typewriter']);
		// The table's own description, which is what the rule checks against
		// stated once above the run.
		expect(idsFor('case is preserved')).toEqual(['spelling.standardized']);
	});

	it('folds a table’s forms like everything else, so the reader types what they have', () => {
		// `'cause` and `y'all` carry the typewriter apostrophe in the table and the
		// reader may well type the curly one, or neither.
		expect(idsFor('y’all')).toEqual(['spelling.standardized']);
		expect(idsFor("y'all")).toEqual(['spelling.standardized']);
	});

	it('matches either spelling of the identifier', () => {
		expect(idsFor('spelling.standardized')).toEqual(['spelling.standardized']);
		expect(idsFor('spelling-standardized')).toEqual(['spelling.standardized']);
	});

	it('finds a rule whose example is spelled with marks the reader will not type', () => {
		// `ça va` is the whole of the French rule's example. Typed without the
		// cedilla it has to land, or the page is unreachable by the only string a
		// reader has. `toContain` rather than an exact list: the terms here are two
		// letters each and match by substring, so a handful of other rules keep
		// them too — this list is filtered, never ranked, because the index is
		// grouped by rule family and a relevance order would have to break that.
		expect(idsFor('ca va')).toContain('spelling.french-common');
		expect(idsFor('ça va')).toEqual(idsFor('ca va'));
	});

	it('folds typographic punctuation to the typewriter kind', () => {
		// Several rules here are *about* the apostrophe, and no plain keyboard
		// produces the curly one these pages are written with.
		expect(idsFor("don't go")).toEqual(['contraction.apostrophe']);
		expect(idsFor('don’t go')).toEqual(['contraction.apostrophe']);
	});

	it('requires every term, so two words narrow rather than widen', () => {
		const chorus = idsFor('chorus');
		const both = idsFor('chorus link');
		expect(chorus.length).toBeGreaterThan(both.length);
		expect(both).toEqual(['section.unlinked-repeat']);
	});

	it('drops a group that keeps nothing rather than leaving the heading standing', () => {
		const matched = filterRuleGroups(groups, { ...unfilteredRules, query: 'definately' });
		expect(matched).toHaveLength(1);
		expect(matched[0]?.title).toBe('Spelling');
		expect(filterRuleGroups(groups, { ...unfilteredRules, query: 'qqzzxx' })).toEqual([]);
	});

	it('narrows by severity and reports itself as filtering', () => {
		const errors = filterRuleGroups(groups, { ...unfilteredRules, severities: ['error'] });
		expect(countRules(errors)).toBeGreaterThan(0);
		for (const group of errors) {
			for (const rule of group.rules) expect(rule.severity).toBe('error');
		}
		expect(isFiltering({ ...unfilteredRules, severities: ['error'] })).toBe(true);
	});

	it('shows nothing when every severity is switched off', () => {
		expect(filterRuleGroups(groups, { ...unfilteredRules, severities: [] })).toEqual([]);
	});

	it('narrows to the rules that are judgment calls', () => {
		const manual = filterRuleGroups(groups, { ...unfilteredRules, fixabilities: ['none'] });
		expect(countRules(manual)).toBeGreaterThan(0);
		for (const group of manual) {
			for (const rule of group.rules) {
				expect(rule.fix, rule.id).toBeUndefined();
				expect(ruleFixability(rule)).toBe('none');
			}
		}
	});

	it('combines the two axes with the query, and a rule has to survive all three', () => {
		const byId = new Map(
			groups.flatMap((group) => group.rules).map((rule) => [rule.id, rule] as const)
		);
		const axes = { severities: ['warning'] as const, fixabilities: ['safe'] as const };
		const both = idsFor('', axes);
		expect(both.length).toBeGreaterThan(0);
		for (const id of both) {
			expect(byId.get(id)?.severity, id).toBe('warning');
			expect(byId.get(id)?.fix?.kind, id).toBe('safe');
		}

		// Adding a query may only take rules away, never introduce one the chips
		// had already excluded.
		const narrowed = idsFor('section', axes);
		expect(narrowed.length).toBeLessThan(both.length);
		for (const id of narrowed) expect(both, id).toContain(id);
	});

	it('counts each chip over the query alone, blind to the chips themselves', () => {
		// A count that also obeyed the chips would read as what the chip is
		// contributing, so pressing it back on would be a press towards zero — and
		// the two chip rows would chase each other's numbers on every toggle.
		const all = ruleCounts(groups, '');
		const severityTotal = severityOrder.reduce((sum, key) => sum + all.severity[key], 0);
		const fixTotal = fixabilityOrder.reduce((sum, key) => sum + all.fixability[key], 0);
		expect(severityTotal).toBe(countRules(groups));
		expect(fixTotal).toBe(countRules(groups));

		const searched = ruleCounts(groups, 'definately');
		expect(searched.severity.suggestion + searched.severity.warning).toBeGreaterThan(0);
		expect(
			severityOrder.reduce((sum, key) => sum + searched.severity[key], 0),
			'the chips add up to the list they hang over'
		).toBe(countRules(filterRuleGroups(groups, { ...unfilteredRules, query: 'definately' })));
	});

	it('offers only the kinds the rule set actually contains', () => {
		const facets = presentFacets(groups);
		for (const severity of facets.severities) {
			expect(ruleCounts(groups, '').severity[severity], severity).toBeGreaterThan(0);
		}
		for (const fixability of facets.fixabilities) {
			expect(ruleCounts(groups, '').fixability[fixability], fixability).toBeGreaterThan(0);
		}
		// Canonical order, not registry order.
		expect(facets.severities).toEqual(
			severityOrder.filter((severity) => facets.severities.includes(severity))
		);
	});

	it('reads a query of nothing but spaces as no query at all', () => {
		expect(searchTokens('   ')).toEqual([]);
		expect(isFiltering({ ...unfilteredRules, query: '   ' })).toBe(false);
		expect(countRules(filterRuleGroups(groups, { ...unfilteredRules, query: '   ' }))).toBe(
			countRules(groups)
		);
	});

	it('folds to one normal form on both sides of the comparison', () => {
		expect(foldForSearch('Ça Va')).toBe('ca va');
		expect(foldForSearch('“Don’t”')).toBe('"don\'t"');
		expect(foldForSearch('word—, then')).toBe('word-, then');
		// Hangul decomposes to jamo rather than to combining marks, so it survives
		// the strip as its own decomposed form — which is what a typed query
		// decomposes to as well.
		expect(foldForSearch('됐')).toBe('됐'.normalize('NFD'));
	});

	it('resolves every rule in the popular block against the index', () => {
		// The block is a hand-written list of IDs, and a rule leaving the catalog
		// would otherwise shorten it silently — `popularRules` skips what it cannot
		// find, because losing a shortcut is not worth failing a page render over.
		// This is where a stale ID is supposed to be caught instead.
		expect(popularRules(groups).map((rule) => rule.id)).toEqual(popularRuleIds);
		// A shortcut into the list has to be shorter than the first screen it is a
		// shortcut past.
		expect(popularRuleIds.length).toBeLessThanOrEqual(6);
	});

	it('names a fixability in the words the rule’s own page uses', () => {
		expect(fixabilityOrder.map(fixabilityLabel)).toEqual([
			'Automatic fix',
			'Previewed fix',
			'No automatic fix'
		]);
	});
});

/** The segments as one string again, which has to be what went in. */
function rejoin(segments: readonly { text: string }[]): string {
	return segments.map((segment) => segment.text).join('');
}

/** Only the marked runs, in order, which is what a reader would see marked. */
function marked(text: string, query: string): string[] {
	return highlightSegments(text, searchTokens(query))
		.filter((segment) => segment.match)
		.map((segment) => segment.text);
}

describe('marking the query inside the rule it opened', () => {
	it('marks nothing while nothing has been asked for', () => {
		expect(highlightSegments('Use song part headers', [])).toEqual([
			{ text: 'Use song part headers', match: false }
		]);
		// Nothing at all rather than one empty segment, so a component drawing
		// these puts no element on the page for a field the rule does not carry.
		expect(highlightSegments('', searchTokens('header'))).toEqual([]);
	});

	it('marks every term, because every term is why the rule was listed', () => {
		expect(marked('Use [Verse 1] rather than Verse 1:', 'verse bracket')).toEqual([
			'Verse',
			'Verse'
		]);
		expect(marked('Wrap the ad-lib in parentheses', 'ad-lib parentheses')).toEqual([
			'ad-lib',
			'parentheses'
		]);
	});

	it('marks whole characters where the fold changed the string’s length', () => {
		// The whole reason the fold is run one character at a time: `Ça` folds to
		// `ca`, so an offset taken from the folded text names a different run of
		// the text on screen. Half a `Ç` is not something a mark can hold.
		expect(marked('Ça va bien', 'ca va')).toEqual(['Ça', 'va']);
		expect(rejoin(highlightSegments('Ça va bien', searchTokens('ca va')))).toBe('Ça va bien');
		// And the same in the other direction: the reader types the apostrophe
		// their keyboard has and the page is written with the curly one.
		expect(marked('Don’t stop', "don't")).toEqual(['Don’t']);
	});

	it('marks a Greek word whose last letter the case fold spells two ways', () => {
		// `toLowerCase` is the one fold here that is not a per-character
		// operation: it implements `Final_Sigma`, so a whole string ends in `ς`
		// and the same string folded a character at a time ends in `σ`. The
		// filter runs the first and the marker runs the second, so without the
		// sigma fold this query narrows the list to a page that draws no mark at
		// all — a search whose answer is a page saying nothing matched.
		expect(searchTokens('λογος')).toEqual([foldForSearch('ΛΟΓΟΣ')]);
		expect(marked('ΛΟΓΟΣ', 'λογος')).toEqual(['ΛΟΓΟΣ']);
		expect(marked('λογος', 'λογοσ')).toEqual(['λογος']);
	});

	it('merges runs that overlap rather than drawing a seam through a word', () => {
		expect(marked('apostrophe', 'apo ost')).toEqual(['apost']);
		// Two occurrences of one term stay two marks, because they are two.
		expect(marked('la la la', 'la')).toEqual(['la', 'la', 'la']);
	});

	it('never changes the text it is marking', () => {
		// The segments are rendered in place of the string, examples included —
		// and those are set in a `<pre>`, where a character gained or lost is a
		// transcription nobody typed.
		for (const group of groups) {
			for (const rule of group.rules) {
				for (const text of [rule.title, rule.message, rule.explanation, rule.invalid, rule.valid]) {
					for (const query of ['e', 'the verse', 'don’t', 'ça']) {
						expect(
							rejoin(highlightSegments(text, searchTokens(query))),
							`${rule.id}: ${text}`
						).toBe(text);
					}
				}
			}
		}
	});
});
