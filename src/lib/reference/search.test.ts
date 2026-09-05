import { describe, expect, it } from 'vitest';
import { referenceCorpus } from './corpus.server.js';
import { searchReference } from './search.js';
import { referenceTopics } from './topics.js';

const corpus = referenceCorpus();
describe('shared reference discovery', () => {
	it('serializes every public document and routes every rule to a shared topic', () => {
		expect(JSON.parse(JSON.stringify(corpus))).toEqual(corpus);
		expect(new Set(corpus.map((item) => item.id)).size).toBe(corpus.length);
		for (const item of corpus)
			expect(referenceTopics.some((topic) => topic.id === item.topic)).toBe(true);
	});
	it('finds unfamiliar spellings and exposes the actual matching lookup row', () => {
		const results = searchReference(corpus, 'woah');
		const spelling = results.find((result) =>
			result.relatedRuleIds.includes('spelling.standardized')
		);
		expect(spelling).toBeDefined();
		expect(spelling?.snippet).toContain('woah');
		expect(spelling?.snippet).toContain('whoa');
		expect(spelling?.relatedRules.some((rule) => rule.id === 'spelling.standardized')).toBe(true);
		expect(results.some((result) => result.id === 'spelling.standardized')).toBe(false);
	});
	it('lets everyday questions find performer guidance from either scope', () => {
		for (const scope of ['all', 'guidelines', 'rules'] as const) {
			const results = searchReference(corpus, 'How do I credit two singers?', { scope });
			expect(results.length).toBeGreaterThan(0);
			expect(results[0]?.topic).toBe('section-headers');
			if (scope !== 'rules')
				expect(results[0]?.id).toBe('guidance.section-headers.artist-identifiers');
		}
	});
	it.each([
		['two singers', 'guidance.section-headers.artist-identifiers'],
		['How do I credit different singers?', 'guidance.section-headers.artist-identifiers'],
		['backing vocals', 'guidance.section-headers.parenthetical-formatting'],
		['cannot hear a word', 'guidance.censored-unknown.unknown-marker']
	])('puts the answer first for %s', (query, id) => {
		expect(searchReference(corpus, query)[0]?.id).toBe(id);
		expect(searchReference(corpus, query, { scope: 'guidelines' })[0]?.id).toBe(id);
		// Intent aliases answer the question with the convention, rather than a
		// source title that happens to contain a word such as “two”.
		expect(searchReference(corpus, query, { scope: 'guidelines' })[0]?.snippet).toContain(
			corpus.find((document) => document.id === id)!.summary.slice(0, 80)
		);
	});
	it('does not interpret numbering or instrumental instructions as singer attribution', () => {
		const results = searchReference(corpus, 'two singers');
		expect(
			results.some((result) =>
				[
					'guidance.section-headers.segue-parts',
					'guidance.section-headers.instrumental',
					'repeat.immediate'
				].includes(result.id)
			)
		).toBe(false);
	});
	it('preserves a pasted warning as the strongest rule match', () => {
		const rule = corpus.find((item) => item.id === 'punctuation.question')!;
		const message = rule.passages[0]!;
		expect(searchReference(corpus, message, { scope: 'rules' })[0]?.id).toBe(rule.id);
	});
	it('tolerates one typo but leaves short unrelated queries unmatched', () => {
		expect(
			searchReference(corpus, 'punctuatoin', { scope: 'guidelines' }).some(
				(result) => result.approximate
			)
		).toBe(true);
		expect(searchReference(corpus, 'qzx')).toEqual([]);
		expect(searchReference(corpus, 'qzxwplm')).toEqual([]);
	});
	it('scopes and topics narrow deterministically without hiding unlinked rules', () => {
		const rules = searchReference(corpus, '', { scope: 'rules', topic: 'spelling' });
		expect(rules.length).toBeGreaterThan(0);
		expect(rules.every((rule) => rule.kind === 'rule' && rule.topic === 'spelling')).toBe(true);
		expect(
			searchReference(corpus, 'language pack').some(
				(result) => result.id === 'language.selection-mismatch'
			)
		).toBe(true);
	});
	it('keeps the strongest check ranking and identifies its provenance when grouped', () => {
		const rule = corpus.find((item) => item.id === 'spelling.standardized')!;
		const results = searchReference(corpus, rule.title);
		expect(results[0]?.relatedRules.some((link) => link.id === rule.id)).toBe(true);
		expect(results[0]?.snippet).toContain('Related linter check:');
		expect(searchReference(corpus, 'tryina', { scope: 'guidelines' })[0]?.snippet).toContain(
			'LyricLint also checks:'
		);
	});
	it('finds literal lyric markup even when no words were typed', () => {
		expect(searchReference(corpus, '[?]').some((item) => item.topic === 'censored-unknown')).toBe(
			true
		);
	});
	it('browses in document order and reuses the server corpus', () => {
		expect(referenceCorpus()).toBe(corpus);
		const spelling = searchReference(corpus, '', { scope: 'guidelines', topic: 'spelling' });
		expect(spelling[0]?.id).toBe('standardized-spellings');
	});
	it('matches reviewed source titles and lookup conditions as well as headings', () => {
		expect(
			searchReference(corpus, 'cousin').some((result) => result.snippet.includes('cousin'))
		).toBe(true);
		expect(searchReference(corpus, 'Genius')).not.toHaveLength(0);
	});
});
