import { describe, expect, it } from 'vitest';
import { parseDocument } from '#lib/core/parser.js';
import type { Diagnostic } from '#lib/core/types.js';
import { runRules } from '#lib/rules/engine.js';
import { ruleContext } from '#lib/rules/rule-test-utils.js';
import { sampleDraftText } from '#lib/ui/sample-draft.js';
import { cityLightsPasted } from './decision-test-utils.js';
import { countDecisions, decisionKey, groupDecisions } from './decisions.js';
import { orderDiagnostics } from './order.js';

function finding(from: number, overrides: Partial<Diagnostic> = {}): Diagnostic {
	return {
		ruleId: 'punctuation.line-ending',
		severity: 'warning',
		message: 'Lyric lines should not end with a comma.',
		explanation: '',
		sourceIds: [],
		from,
		to: from + 1,
		fixes: [
			{
				kind: 'preview',
				label: 'Remove the comma',
				edit: { baseRevision: 1, edits: [{ from, to: from + 1, insert: '' }] }
			}
		],
		...overrides
	};
}

const decisionsOf = (text: string) =>
	groupDecisions(orderDiagnostics(runRules(parseDocument(text), ruleContext())));

describe('decisionKey', () => {
	it('joins the same question at different places', () => {
		expect(decisionKey(finding(10))).toBe(decisionKey(finding(90)));
	});

	it('keeps apart findings whose message, severity, fix label, or rule differ', () => {
		const base = decisionKey(finding(10));
		expect(
			decisionKey(finding(10, { message: 'Lyric lines should not end with a period.' }))
		).not.toBe(base);
		expect(decisionKey(finding(10, { severity: 'suggestion' }))).not.toBe(base);
		expect(decisionKey(finding(10, { ruleId: 'punctuation.other' }))).not.toBe(base);
		expect(
			decisionKey(
				finding(10, {
					fixes: [
						{
							kind: 'preview',
							label: 'Replace with a period',
							edit: { baseRevision: 1, edits: [] }
						}
					]
				})
			)
		).not.toBe(base);
	});

	it('keeps apart members that name a different identity', () => {
		const ada = finding(10, { ruleId: 'performer.inline-mismatch', identityText: 'Ada' });
		const bo = finding(40, { ruleId: 'performer.inline-mismatch', identityText: 'Bo' });
		expect(decisionKey(ada)).not.toBe(decisionKey(bo));
		expect(groupDecisions([ada, bo])).toHaveLength(2);
	});

	it('leaves a finding that spans other ranges or names a language on its own', () => {
		expect(decisionKey(finding(10, { relatedRanges: [{ from: 40, to: 41 }] }))).toBeNull();
		expect(
			decisionKey(finding(10, { detectedLanguage: { tag: 'nb', displayName: 'Norwegian' } }))
		).toBeNull();
	});
});

describe('groupDecisions', () => {
	it('lists decisions in reading order and their members in document order', () => {
		const error = finding(50, { severity: 'error', message: 'Header missing.', fixes: [] });
		const decisions = groupDecisions([error, finding(30), finding(10), finding(20)]);
		expect(decisions.map((decision) => decision.members.map((member) => member.from))).toEqual([
			[50],
			[10, 20, 30]
		]);
	});

	it('gives a related-range finding its own row even beside an identical message', () => {
		const repeat = finding(10, { relatedRanges: [{ from: 40, to: 41 }] });
		const decisions = groupDecisions(
			[repeat, { ...repeat, from: 60, to: 61 }],
			(d) => `row-${d.from}`
		);
		expect(decisions.map((decision) => decision.key)).toEqual(['row-10', 'row-60']);
	});

	it('draws the 26 places of a pasted City Lights as 3 decisions', () => {
		const decisions = decisionsOf(cityLightsPasted);
		expect(decisions.map((decision) => decision.members.length)).toEqual([15, 10, 1]);
		expect(decisions[1]!.members[0]!.message).toBe('Lyric lines should not end with a comma.');
	});

	it('keeps the opening and closing curly quote as two decisions', () => {
		const decisions = decisionsOf(sampleDraftText);
		expect(decisions).toHaveLength(6);
		const quotes = decisions.filter(
			(decision) => decision.members[0]!.ruleId === 'quotes.typewriter'
		);
		expect(quotes.map((decision) => decision.members[0]!.message)).toEqual([
			'Use a straight " instead of the opening curly double quote.',
			'Use a straight " instead of the closing curly double quote.'
		]);
	});

	it('counts rows without needing the reading order', () => {
		expect(countDecisions([finding(30), finding(10), finding(20, { severity: 'error' })])).toBe(2);
	});
});
