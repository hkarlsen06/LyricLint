import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { Diagnostic, RuleContext, RuleDefinition, SourceReference } from '$lib/core/types.js';
import { collectSafeFixes, runRules, sortDiagnostics } from './engine.js';
import { enabledRules, validateRuleRegistry } from './registry.js';
import { sourceRegistry } from './data/sources.js';

const context: RuleContext = {
	language: 'en',
	performers: [],
	sources: sourceRegistry,
	ruleSetVersion: '2026.07.24.4',
	revision: 11
};

function finding(
	ruleId: string,
	severity: Diagnostic['severity'],
	from: number,
	fixKind?: 'safe' | 'preview'
): Diagnostic {
	return {
		ruleId,
		severity,
		from,
		to: from + 1,
		message: ruleId,
		explanation: ruleId,
		sourceIds: ['G-SECTIONS'],
		fixes: fixKind
			? [
					{
						kind: fixKind,
						label: fixKind,
						edit: { baseRevision: 0, edits: [{ from, to: from + 1, insert: '' }] }
					}
				]
			: undefined
	};
}

describe('rule engine', () => {
	it('sorts severity before exact range and stable tie breakers', () => {
		const sorted = sortDiagnostics([
			finding('manual', 'manual-review', 0),
			finding('warning-b', 'warning', 8),
			finding('suggestion', 'suggestion', 0),
			finding('error', 'error', 9),
			finding('warning-a', 'warning', 8),
			finding('warning-first', 'warning', 2)
		]);
		expect(sorted.map((item) => item.ruleId)).toEqual([
			'error',
			'warning-first',
			'warning-a',
			'warning-b',
			'suggestion',
			'manual'
		]);
	});

	it('collects only safe fixes', () => {
		const diagnostics = [
			finding('safe', 'warning', 0, 'safe'),
			finding('preview', 'warning', 2, 'preview'),
			finding('none', 'warning', 4)
		];
		expect(collectSafeFixes(diagnostics).map((fix) => fix.kind)).toEqual(['safe']);
	});

	it('returns identical diagnostics for identical input and context', () => {
		const document = parseDocument('[Verse]\nImma stay');
		expect(runRules(document, context)).toEqual(runRules(document, context));
	});

	it('carries the rule snapshot revision on every produced fix edit', () => {
		const document = parseDocument('[Verse]\nImma dont “go” with 5 reasons (?) {laughs}');
		const diagnostics = runRules(document, { ...context, revision: 5 });
		const fixes = diagnostics.flatMap((diagnostic) => diagnostic.fixes ?? []);

		expect(fixes.length).toBeGreaterThan(0);
		expect(fixes.every((fix) => fix.edit.baseRevision === 5)).toBe(true);
	});

	it('emits one capitalization finding for English first-person i at a line start', () => {
		const diagnostics = runRules(parseDocument('[Verse]\ni know'), context).filter(
			(item) =>
				item.ruleId === 'grammar.english-pronoun-i' || item.ruleId === 'capitalization.line-start'
		);

		expect(diagnostics.map((item) => item.ruleId)).toEqual(['grammar.english-pronoun-i']);
	});
});

describe('registry validation', () => {
	const baseRule: RuleDefinition = {
		id: 'test.rule',
		version: 1,
		defaultSeverity: 'warning',
		sourceIds: ['G-SECTIONS'],
		check: () => []
	};

	it('accepts the complete reviewed enabled registry', () => {
		expect(enabledRules).toHaveLength(60);
		expect(() => validateRuleRegistry()).not.toThrow();
	});

	it('rejects duplicate rule IDs', () => {
		expect(() => validateRuleRegistry([baseRule, { ...baseRule }])).toThrow(/Duplicate rule ID/u);
	});

	it('rejects an enabled rule whose source is not reviewed', () => {
		const needsReview: SourceReference = {
			id: 'candidate',
			url: 'https://genius.com/1',
			annotationId: 1,
			pageTitle: 'Candidate',
			sectionTitle: 'Candidate',
			retrievedAt: '2026-07-24',
			lastVerifiedAt: '2026-07-24',
			reviewStatus: 'needs-review',
			authority: 'community'
		};
		expect(() =>
			validateRuleRegistry(
				[{ ...baseRule, sourceIds: ['candidate'] }],
				new Map([['candidate', needsReview]])
			)
		).toThrow(/needs-review/u);
	});
});
