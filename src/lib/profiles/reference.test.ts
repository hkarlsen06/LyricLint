import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import { importDocument, parseProjection, renderProfile } from '$lib/conversion/index.js';
import { musixmatchRules } from '$lib/rules/musixmatch.js';
import { ruleReferenceFromSlug, ruleReferences } from '$lib/rules/reference.js';
import { profileSourceRegistry } from './sources.js';
import { profileGuidelines } from './coverage.js';
import { musixmatchPolicyCases } from './policy-cases.js';
import { musixmatchReferenceCorpus, profileGuidelineTopic } from './reference.server.js';
import { referenceTopics } from '$lib/reference/topics.js';

describe('Musixmatch public policy reference', () => {
	it('derives every check page from a tested invented trigger and accepted boundary', () => {
		expect(musixmatchPolicyCases.map((item) => item.id)).toEqual(
			musixmatchRules.map((rule) => rule.id)
		);
		for (const policy of musixmatchPolicyCases) {
			const rule = musixmatchRules.find((candidate) => candidate.id === policy.id)!;
			const context = {
				profile: 'musixmatch' as const,
				language: policy.language ?? 'en',
				performers: [],
				sources: profileSourceRegistry,
				ruleSetVersion: '2026.09.16.1',
				revision: 0
			};
			expect(rule.check(parseDocument(policy.invalid), context).length, policy.id).toBeGreaterThan(
				0
			);
			expect(rule.check(parseDocument(policy.valid), context), policy.id).toEqual([]);
			expect(rule.check(parseDocument(policy.ambiguous), context), policy.id).toEqual([]);
		}
		const references = ruleReferences('musixmatch');
		expect(references).toHaveLength(26);
		for (const reference of references) {
			expect(reference.profile).toBe('musixmatch');
			expect(ruleReferenceFromSlug(reference.slug)).toEqual(reference);
			expect(reference.sources.every((source) => source.id.startsWith('MXM-'))).toBe(true);
			expect(reference.guidelines?.map((entry) => entry.anchor) ?? []).toEqual(
				profileGuidelines
					.filter((entry) => entry.ruleIds.includes(reference.id))
					.map((entry) => entry.id.toLowerCase())
			);
		}
	});

	it('publishes every claim once with checks, sources, scope and a reachable topic', () => {
		const corpus = musixmatchReferenceCorpus();
		expect(corpus.filter((entry) => entry.kind === 'guideline')).toHaveLength(111);
		expect(corpus.filter((entry) => entry.kind === 'rule')).toHaveLength(26);
		expect(new Set(corpus.map((entry) => entry.href)).size).toBe(137);
		for (const claim of profileGuidelines) {
			expect(referenceTopics.some((topic) => topic.id === profileGuidelineTopic(claim))).toBe(true);
			const entry = corpus.find((candidate) => candidate.id === claim.id)!;
			expect(entry.passages).toContain(claim.limit);
			expect(entry.relatedRuleIds).toEqual(claim.ruleIds);
			for (const rule of claim.ruleIds)
				expect(corpus.some((candidate) => candidate.id === rule)).toBe(true);
		}
	});

	it('finds an unresolved header literal in the actual Musixmatch projection parser', () => {
		const imported = importDocument({ profile: 'musixmatch', text: '[Verse]\nWe return' });
		if (!imported.ok) throw new Error(imported.refusal.message);
		const rendered = renderProfile(imported.value, 'musixmatch');
		if (!rendered.ok) throw new Error(rendered.refusal.message);
		const parsed = parseProjection(imported.value, rendered.value, 'en');
		expect(parsed.sections.every((section) => !section.header)).toBe(true);
		const rule = musixmatchRules.find((candidate) => candidate.id === 'mxm.transcription.labels')!;
		const diagnostics = rule.check(parsed, {
			profile: 'musixmatch',
			language: 'en',
			performers: [],
			sources: profileSourceRegistry,
			ruleSetVersion: '2026.09.16.1',
			revision: 0
		});
		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].from).toBe(0);
		expect(diagnostics[0].to).toBe(7);
		expect(diagnostics[0].fixes).toBeUndefined();
	});
});
