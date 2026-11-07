import { describe, expect, it } from 'vitest';
import { importDocument, parseProjection, renderProfile } from '#lib/conversion/index.js';
import { parseDocument } from '#lib/core/parser.js';
import type { RuleContext } from '#lib/core/types.js';
import { profileSourceRegistry } from '#lib/profiles/sources.js';
import { sampleDraftText } from '#lib/ui/sample-draft.js';
import { runRules } from './engine.js';

const context: RuleContext = {
	profile: 'musixmatch',
	language: 'en',
	performers: [],
	sources: profileSourceRegistry,
	ruleSetVersion: 'test',
	revision: 17
};

describe('shared transcription checks in Musixmatch', () => {
	it('keeps the sample contraction, ordinary spelling and pronoun findings after switching', () => {
		const imported = importDocument({ text: sampleDraftText, profile: 'genius', language: 'en' });
		if (!imported.ok) throw new Error(imported.refusal.message);
		const projected = renderProfile(imported.value, 'musixmatch');
		if (!projected.ok) throw new Error(projected.refusal.message);
		const text = projected.value.text;
		const findings = runRules(parseProjection(imported.value, projected.value), context);
		for (const [id, token, replacement] of [
			['contraction.apostrophe', 'dont', "don't"],
			['spelling.english-common', 'Definately', 'Definitely'],
			['grammar.english-pronoun-i', 'i', 'I']
		] as const) {
			const from =
				token === 'i' ? text.indexOf('window i') + 'window '.length : text.indexOf(token);
			const matching = findings.filter((finding) => finding.ruleId === id);
			expect(matching).toHaveLength(1);
			expect(matching[0]).toMatchObject({ from, to: from + token.length });
			expect(matching[0]?.fixes?.[0].edit).toMatchObject({
				baseRevision: 17,
				edits: [{ from, to: from + token.length, insert: replacement }]
			});
		}
		expect(findings.some((finding) => finding.ruleId === 'section.header-missing')).toBe(false);
		expect(findings.some((finding) => finding.ruleId === 'quotes.typewriter')).toBe(false);
	});

	it.each([
		['I watch  the moon', 'text.multiple-spaces'],
		['I watch\u200b the moon  ', 'text.invisible-characters'],
		['I watch the moon (oh', 'syntax.unbalanced-parentheses'],
		['I watch(oh)the moon', 'punctuation.parenthesis-spacing']
	])('checks shared text hygiene in %s', (text, ruleId) => {
		const findings = runRules(parseDocument(text), context).filter(
			(finding) => finding.ruleId === ruleId
		);
		expect(findings.length).toBeGreaterThan(0);
		expect(
			findings.every((finding) => finding.sourceIds.every((id) => !id.startsWith('MXM-')))
		).toBe(true);
	});

	it('keeps unknown-language words quiet while checking their English neighbors', () => {
		const text = 'You dont see\nEvery window i pass';
		const findings = runRules(parseDocument(text), {
			...context,
			languageRanges: [{ from: 4, to: 8, language: 'und' }]
		});
		expect(findings.some((finding) => finding.ruleId === 'contraction.apostrophe')).toBe(false);
		expect(
			findings.filter((finding) => finding.ruleId === 'grammar.english-pronoun-i')
		).toHaveLength(1);
	});

	it('withholds shared fixes across an explicit language boundary', () => {
		const findings = runRules(parseDocument('You dont see'), {
			...context,
			languageRanges: [{ from: 6, to: 8, language: 'fr' }]
		});
		expect(findings.find((finding) => finding.ruleId === 'contraction.apostrophe')).toMatchObject({
			severity: 'manual-review',
			fixes: undefined
		});
	});
});
