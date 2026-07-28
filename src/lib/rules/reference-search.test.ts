import { describe, expect, it } from 'vitest';
import {
	countRules,
	filterRuleGroups,
	fixabilityLabel,
	fixabilityOrder,
	foldForSearch,
	isFiltering,
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

	it('names a fixability in the words the rule’s own page uses', () => {
		expect(fixabilityOrder.map(fixabilityLabel)).toEqual([
			'Automatic fix',
			'Previewed fix',
			'No automatic fix'
		]);
	});
});
