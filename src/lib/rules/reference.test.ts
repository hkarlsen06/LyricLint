import { describe, expect, it } from 'vitest';
import { policyCases } from './catalog/policy-cases.js';
import { sourceRegistry } from './data/sources.js';
import { groupGuidance } from './reference-guide.js';
import { ruleLookupTables } from './lookup-tables.js';
import {
	groupedRuleReferences,
	ruleFromSlug,
	ruleReferenceFromSlug,
	ruleReferences,
	ruleSlug
} from './reference.js';
import { enabledRules } from './registry.js';

describe('rule reference derivation', () => {
	it('derives a page for every enabled rule from its policy case', () => {
		// `ruleReferences` throws for a rule with no policy case or whose invalid
		// example produces no diagnostic, so a new rule cannot ship without a
		// reference page — this assertion is what turns that contract into CI.
		const references = ruleReferences();
		expect(references.map((reference) => reference.id)).toEqual(
			enabledRules.map((rule) => rule.id)
		);
		for (const reference of references) {
			expect(reference.message.length, reference.id).toBeGreaterThan(0);
			expect(reference.explanation.length, reference.id).toBeGreaterThan(0);
			expect(reference.groupTitle.length, reference.id).toBeGreaterThan(0);
			expect(reference.language.length, reference.id).toBeGreaterThan(0);
			expect(reference.sources.length, reference.id).toBeGreaterThan(0);
		}
	});

	it('names every rule with a written title that is not its message', () => {
		// The one string in the reference that is written rather than run, so it is
		// the one that needs pinning. A title is what the index is scanned by: it
		// has to exist, it has to be distinct from every other, it has to say
		// something the message does not, and it has to be short enough to stay one
		// line in a column beside the rule the reader is reading.
		const references = ruleReferences();
		const titles = references.map((reference) => reference.title);
		expect(new Set(titles).size).toBe(references.length);
		for (const reference of references) {
			expect(reference.title.trim(), reference.id).toBe(reference.title);
			expect(reference.title.length, reference.id).toBeGreaterThan(0);
			expect(reference.title.length, reference.id).toBeLessThanOrEqual(44);
			// A title that is the message is the drift this field exists to end:
			// fifty-two occurrence-specific messages is what the index used to be.
			expect(reference.title, reference.id).not.toBe(reference.message);
			// It names what the rule catches, so it is a noun phrase rather than a
			// sentence about one occurrence.
			expect(reference.title, reference.id).not.toMatch(/\.$/u);
		}
	});

	it('states every family’s convention, and states it once', () => {
		// The guide is the connective tissue the reference could not derive: the
		// index used to give a reader arriving from the landing page the whole
		// catalog of checks bare, which is the shape a linter decomposes into
		// rather than an answer to “what are the conventions”. Exhaustive, so a
		// rule family cannot ship into the index with no statement of what it is
		// for.
		const families = groupedRuleReferences().map((group) => group.group);
		expect(Object.keys(groupGuidance).sort()).toEqual([...families].sort());
		for (const family of families) {
			const guidance = groupGuidance[family]!;
			expect(guidance.trim(), family).toBe(guidance);
			expect(guidance.length, family).toBeGreaterThan(80);
		}

		// And it is the *only* written prose in the reference, which is the bound
		// that keeps it from drifting: a sentence here that restated a rule's
		// message or explanation would have to be re-edited whenever that rule
		// changed its wording, and nothing would say so.
		const written = Object.values(groupGuidance).join('\n');
		for (const reference of ruleReferences()) {
			expect(written, reference.id).not.toContain(reference.message);
			expect(written, reference.id).not.toContain(reference.explanation);
		}
	});

	it('carries a variant marker only where a convention exists once per language', () => {
		const variants = ruleReferences().filter((reference) => reference.variant);
		expect(variants.map((reference) => reference.variant!.language)).toEqual([
			'English',
			'Norwegian',
			'German',
			'Spanish',
			'French',
			'Arabic',
			'Japanese',
			'Korean'
		]);
		// One family, named once. Two spellings of it would draw two rows.
		expect(new Set(variants.map((reference) => reference.variant!.family)).size).toBe(1);
		// The collapse is presentation only: every one of them is still its own
		// entry here, which is what the sitemap, the prerender entries and the
		// structured data all read.
		expect(groupedRuleReferences().flatMap((group) => group.rules)).toHaveLength(
			enabledRules.length
		);
	});

	it('has no policy case for a rule that is not enabled', () => {
		const enabledIds = new Set(enabledRules.map((rule) => rule.id));
		expect(policyCases.filter((policy) => !enabledIds.has(policy.id))).toEqual([]);
	});

	it('gives every rule a unique slug that round-trips to its ID', () => {
		const slugs = enabledRules.map((rule) => ruleSlug(rule.id));
		expect(new Set(slugs).size).toBe(enabledRules.length);
		for (const rule of enabledRules) {
			expect(ruleFromSlug(ruleSlug(rule.id))).toBe(rule.id);
			expect(ruleReferenceFromSlug(ruleSlug(rule.id))?.id).toBe(rule.id);
		}
		// Dots are what the slug exists to remove: a dot in a static-adapter path
		// segment writes a file whose "extension" is half the rule ID.
		for (const slug of slugs) {
			expect(slug).not.toContain('.');
		}
	});

	it('resolves every enabled rule source ID in the source registry', () => {
		for (const rule of enabledRules) {
			for (const sourceId of rule.sourceIds) {
				expect(sourceRegistry.get(sourceId)?.id, `${rule.id} → ${sourceId}`).toBe(sourceId);
			}
		}
	});

	it('carries a table-shaped rule’s search terms and nothing heavier', () => {
		const references = ruleReferences();
		const tabled = new Set(ruleLookupTables().map((table) => table.ruleId));
		for (const reference of references) {
			expect(
				reference.lookupTerms !== undefined,
				`${reference.id} disagrees with lookup-tables about having a table`
			).toBe(tabled.has(reference.id));
		}
		const spellings = references.find((entry) => entry.id === 'spelling.standardized')!;
		// Every form, so the index's search can find any of them.
		expect(spellings.lookupTerms).toContain('tryna');
		expect(spellings.lookupTerms).toContain("y'all");
		// And the prose the page is mostly made of, which for these eight rules is
		// the table's own description and the conditions written down its rows —
		// deduped, because a gate is repeated on row after row and a haystack has
		// no use for the copies.
		expect(spellings.lookupTerms).toContain('remains valid when it means cousin');
		const unflagged = 'LyricLint reports neither form';
		expect(spellings.lookupTerms).toContain(unflagged);
		expect(
			spellings.lookupTerms!.split(unflagged),
			'a condition two rows share is carried once, not twice'
		).toHaveLength(2);

		// And no more than that. The reference travels in the section layout's
		// data, so it is copied into all 55 prerendered payloads; what the search
		// needs is 5.8% of that payload against the full table's 16.2%, for content
		// six of every seven pages never draw. The page loads its own through
		// `+page.server.ts`, which is why the structure never rides along — only
		// the text.
		const payload = JSON.stringify(groupedRuleReferences()).length;
		const terms = references.reduce(
			(sum, reference) => sum + (reference.lookupTerms?.length ?? 0),
			0
		);
		const full = JSON.stringify(ruleLookupTables()).length;
		expect(terms / payload).toBeLessThan(0.07);
		expect(terms / full).toBeLessThan(0.5);
		expect(full / payload).toBeGreaterThan(0.1);
		expect(JSON.stringify(references)).not.toContain('appliesWhen');
	});

	it('keeps meta descriptions within what result pages display', () => {
		for (const reference of ruleReferences()) {
			expect(reference.seoDescription.length, reference.id).toBeLessThanOrEqual(155);
			expect(reference.seoDescription.length, reference.id).toBeGreaterThanOrEqual(90);
		}
	});

	it('groups the index contiguously with every rule in exactly one group', () => {
		const groups = groupedRuleReferences();
		const flattened = groups.flatMap((group) => group.rules.map((reference) => reference.id));
		expect(new Set(flattened).size).toBe(enabledRules.length);
		expect(new Set(groups.map((group) => group.title)).size).toBe(groups.length);
	});

	it('opens the index on what a transcriber actually looks up', () => {
		// `groupedRuleReferences` throws for a family with no place in `groupOrder`,
		// so exhaustiveness is already a build error and needs no assertion. What is
		// worth pinning is the decision itself: this order is editorial — nothing
		// here is measured, because the product measures nothing — so it has to be
		// something a reorder changes on purpose rather than a side effect of the
		// order the rules happen to run in.
		const titles = groupedRuleReferences().map((group) => group.title);
		expect(titles.slice(0, 2)).toEqual(['Section headers', 'Spelling']);
		// The specific regression: registry order is the pipeline's order, and it
		// put one rule nobody arrives looking for on the reader's first screen.
		expect(titles.at(-1)).toBe('Language selection');
		expect(titles.indexOf('Spelling')).toBeLessThan(titles.indexOf('Performer attribution'));
	});
});
