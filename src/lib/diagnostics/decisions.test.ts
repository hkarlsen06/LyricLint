import { describe, expect, it } from 'vitest';
import { parseDocument } from '#lib/core/parser.js';
import type { Diagnostic } from '#lib/core/types.js';
import { runRules } from '#lib/rules/engine.js';
import { ruleContext } from '#lib/rules/rule-test-utils.js';
import { sampleDraftText } from '#lib/ui/sample-draft.js';
import { cityLightsPasted } from './decision-test-utils.js';
import {
	countDecisions,
	decisionKey,
	groupDecisions,
	keepOrder,
	type Decision
} from './decisions.js';
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
		expect(decisions[1]!.members[0]!.message).toBe('Consider removing the final comma.');
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

describe('keepOrder', () => {
	/** A native warning at `from`, or Harper's when the key starts with `h`. */
	const row = (key: string, from: number): Decision => ({
		key,
		members: [finding(from, key.startsWith('h') ? { ruleId: 'spelling.harper' } : {})]
	});
	const keys = (rows: readonly { key: string }[]) => rows.map(({ key }) => key);
	/** Keep order from `drawn` and return the drawn keys with the remembered ones. */
	const arrange = (ranked: readonly Decision[], drawn: readonly Decision[]) => {
		const kept = keepOrder(orderedRows(ranked), drawn);
		return { rows: keys(kept.rows), remembered: keys(kept.remembered), kept };
	};
	/** Rank rows the way the panel does: by `orderDiagnostics` on first members. */
	const orderedRows = (rows: readonly Decision[]) =>
		orderDiagnostics(rows.map((decision) => decision.members[0]!)).map((member) =>
			rows.find((decision) => decision.members[0] === member)!
		);
	const x = row('x', 10);
	const a = row('a', 20);
	const y = row('y', 30);
	const z = row('z', 40);
	const harper = row('h1', 5);
	const otherHarper = row('h2', 15);

	it('keeps surviving rows where they were drawn, whatever their rank now', () => {
		expect(arrange([a, x, y, z], [z, a, x, y]).rows).toEqual(['z', 'a', 'x', 'y']);
	});

	it('closes the gap a leaving row leaves without moving the others', () => {
		expect(arrange([x, z], [z, a, x]).rows).toEqual(['z', 'x']);
	});

	it('remembers an absent row so it comes back to its old slot', () => {
		// A Harper row out of rank, gone on the native-only publish after an edit.
		const away = arrange([a, y], [y, otherHarper, a, harper]);
		expect(away.rows).toEqual(['y', 'a']);
		expect(away.remembered).toEqual(['y', 'h2', 'a', 'h1']);

		expect(arrange([a, y, harper, otherHarper], away.kept.remembered).rows).toEqual([
			'y',
			'h2',
			'a',
			'h1'
		]);
	});

	it('lets a new Harper row in under every native row, ranked or not', () => {
		// `y` was answered down to rank below `a`, which drew below it.
		expect(arrange([a, y, harper], [y, a]).rows).toEqual(['y', 'a', 'h1']);
	});

	it('lets a new native row in above Harper rows that are away', () => {
		const typed = arrange([x, a], [x, harper, otherHarper]);
		expect(typed.rows).toEqual(['x', 'a']);
		expect(arrange([x, a, harper, otherHarper], typed.kept.remembered).rows).toEqual([
			'x',
			'a',
			'h1',
			'h2'
		]);
	});

	it('lets a new row in above the first drawn row ranked below it', () => {
		expect(arrange([x, y, z], [z, x]).rows).toEqual(['y', 'z', 'x']);
	});

	it('lets several new rows in at once, each by its own rank', () => {
		expect(arrange([x, a, y, z, harper], [y]).rows).toEqual(['x', 'a', 'y', 'z', 'h1']);
	});

	it('puts a new row ranked above everything first', () => {
		expect(arrange([x, a, y], [y, a]).rows).toEqual(['x', 'y', 'a']);
	});

	it('draws the ranked order when every row is new', () => {
		expect(arrange([y, x, harper], [a, z]).rows).toEqual(['x', 'y', 'h1']);
		expect(arrange([y, x], []).rows).toEqual(['x', 'y']);
	});

	it('keeps every native row above every Harper row through any run of snapshots', () => {
		let seed = 7;
		const random = (below: number) => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return seed % below;
		};
		const pool = Array.from({ length: 12 }, (_, index) =>
			row(index < 6 ? `n${index}` : `h${index}`, 0)
		);
		let remembered: Decision[] = [];
		for (let step = 0; step < 300; step += 1) {
			// Rows come and go, and answering a place moves a row's first member.
			const ranked = orderedRows(
				pool
					.filter(() => random(3) > 0)
					.map((decision) => ({
						key: decision.key,
						members: [{ ...decision.members[0]!, from: random(100) }]
					}))
			);
			const kept = keepOrder(ranked, remembered);
			expect([...kept.rows].sort((a, b) => a.key.localeCompare(b.key))).toEqual(
				[...ranked].sort((a, b) => a.key.localeCompare(b.key))
			);
			const drawn = keys(kept.rows);
			const firstHarper = drawn.findIndex((key) => key.startsWith('h'));
			if (firstHarper !== -1)
				expect(drawn.slice(firstHarper).every((key) => key.startsWith('h'))).toBe(true);
			// A release now and then, as a chip, a draft, or a replacement would.
			remembered = random(25) === 0 ? [] : kept.remembered;
		}
	});

	it('draws nothing for no rows and still remembers the drawn ones', () => {
		expect(arrange([], [x, a])).toMatchObject({ rows: [], remembered: ['x', 'a'] });
	});
});
