import { parseDocument } from '$lib/core/parser.js';
import type { Diagnostic, DiagnosticFix, RuleContext } from '$lib/core/types.js';
import { collectSafeFixes, runRules } from './engine.js';
import { getRule } from './registry.js';
import { sourceRegistry } from './data/sources.js';
import { applyEdits, performerRecords, ruleContext, testRevision } from './rule-test-utils.js';
import { describe, expect, it } from 'vitest';

interface FixContract {
	id: string;
	input: string;
	language: string;
	range: [number, number];
	expected: string;
	kind: 'safe' | 'preview';
	performers?: string[];
	label?: string;
}

const contracts: FixContract[] = [
	{
		id: 'syntax.unbalanced-brackets',
		input: '[Verse\nLine',
		language: 'en',
		range: [6, 6],
		expected: '[Verse]\nLine',
		kind: 'safe'
	},
	{
		id: 'syntax.unsupported-voice-markup',
		input: '[Verse]\n<u>Voice',
		language: 'en',
		range: [8, 11],
		expected: '[Verse]\nVoice',
		kind: 'preview',
		label: 'Remove markup'
	},
	{
		id: 'section.header-language',
		input: '[Verse]\nEn natt',
		language: 'no',
		range: [1, 6],
		expected: '[Vers]\nEn natt',
		kind: 'preview'
	},
	{
		id: 'section.localized-header-preference',
		input: '[Chorus: Ane]\nEn natt',
		language: 'no',
		range: [1, 7],
		expected: '[Refreng: Ane]\nEn natt',
		kind: 'safe'
	},
	{
		id: 'section.header-spacing',
		input: '[Verse]\nFirst\n[Chorus]\nSecond',
		language: 'en',
		range: [14, 22],
		expected: '[Verse]\nFirst\n\n[Chorus]\nSecond',
		kind: 'safe',
		label: 'Add blank line'
	},
	{
		id: 'section.immediate-repeat-spacing',
		input: '[Chorus]\nAgain\nTonight\n\n[Chorus]\nAgain\nTonight',
		language: 'en',
		range: [24, 32],
		expected: '[Chorus]\nAgain\nTonight\nAgain\nTonight',
		kind: 'safe'
	},
	{
		id: 'performer.redundant-markup',
		input: '[Verse: A & <i>B</i>]\n<i>First</i>\n<i>Second</i>',
		language: 'en',
		range: [30, 38],
		expected: '[Verse: A & <i>B</i>]\n<i>First\nSecond</i>',
		kind: 'safe'
	},
	{
		id: 'performer.parenthetical-boundary',
		input: '[Verse: A & <i>B</i>]\nA (<i>Voice</i>)',
		language: 'en',
		range: [24, 38],
		expected: '[Verse: A & <i>B</i>]\nA <i>(Voice)</i>',
		kind: 'safe',
		label: 'Include parentheses in performer formatting'
	},
	{
		id: 'performer.header-required',
		input: '[Verse]\n<i>First voice\nSecond voice</i>\n<b>Third voice</b>',
		language: 'en',
		range: [1, 6],
		expected: '[Verse]\nFirst voice\nSecond voice\nThird voice',
		kind: 'safe',
		performers: ['A', 'B'],
		label: 'Remove performer formatting'
	},
	{
		id: 'performer.unused-legend-slot',
		input: '[Verse: A & <i>B</i>]\nOnly A sings',
		language: 'en',
		range: [8, 20],
		expected: '[Verse: A]\nOnly A sings',
		kind: 'safe'
	},
	{
		id: 'performer.line-label-forbidden',
		input: '[Verse: Avery]\n[Avery] A line',
		language: 'en',
		range: [15, 22],
		expected: '[Verse: Avery]\nA line',
		kind: 'preview',
		performers: ['Avery'],
		label: 'Remove the line label'
	},
	{
		id: 'spelling.standardized',
		input: '[Verse]\nImma go',
		language: 'en',
		range: [8, 12],
		expected: "[Verse]\nI'ma go",
		kind: 'safe'
	},
	{
		id: 'quotes.typewriter',
		input: '[Verse]\n“Hello',
		language: 'en',
		range: [8, 9],
		expected: '[Verse]\n"Hello',
		kind: 'safe'
	},
	{
		id: 'contraction.apostrophe',
		input: '[Verse]\nDont go',
		language: 'en',
		range: [8, 12],
		expected: "[Verse]\nDon't go",
		kind: 'preview'
	},
	{
		id: 'unknown.marker',
		input: '[Verse]\nI heard (?)',
		language: 'en',
		range: [16, 19],
		expected: '[Verse]\nI heard [?]',
		kind: 'safe'
	},
	{
		id: 'sound-effect.asterisks',
		input: '[Verse]\n{laughs}',
		language: 'en',
		range: [8, 16],
		expected: '[Verse]\n*laughs*',
		kind: 'preview'
	},
	{
		id: 'censored.mask',
		input: '[Verse]\nf*** this',
		language: 'en',
		range: [8, 12],
		expected: '[Verse]\n**** this',
		kind: 'preview'
	},
	{
		id: 'adlib.parentheses',
		input: '[Verse]\n(yeah)',
		language: 'en',
		range: [9, 13],
		expected: '[Verse]\n(Yeah)',
		kind: 'preview'
	},
	{
		id: 'capitalization.line-start',
		input: '[Verse]\nthe night is young',
		language: 'en',
		range: [8, 9],
		expected: '[Verse]\nThe night is young',
		kind: 'preview'
	},
	{
		id: 'punctuation.line-ending',
		input: '[Verse]\nLine.',
		language: 'en',
		range: [12, 13],
		expected: '[Verse]\nLine',
		kind: 'preview',
		label: 'Remove the period'
	},
	{
		id: 'punctuation.question',
		input: '[Verse]\nWhere are you',
		language: 'en',
		range: [21, 21],
		expected: '[Verse]\nWhere are you?',
		kind: 'preview'
	},
	{
		id: 'punctuation.dropped-word-dash',
		input: '[Verse]\nA word—, then silence',
		language: 'en',
		range: [14, 16],
		expected: '[Verse]\nA word— then silence',
		kind: 'preview'
	},
	{
		id: 'numbers.spell-out',
		input: '[Verse]\nI need 5 reasons',
		language: 'en',
		range: [15, 16],
		expected: '[Verse]\nI need five reasons',
		kind: 'preview'
	}
];

describe('rule fix contracts', () => {
	it.each(contracts)(
		'keeps $id range, severity, provenance, output, and safety classification exact',
		({ id, input, language, range, expected, kind, performers = [], label }) => {
			const rule = getRule(id);
			if (!rule) throw new Error(`Missing rule ${id}`);
			const context: RuleContext = {
				language,
				performers: performerRecords(performers),
				sources: sourceRegistry,
				ruleSetVersion: 'contract-test',
				revision: 73
			};
			const diagnostics = rule.check(parseDocument(input), context);
			expect(diagnostics).toHaveLength(1);
			const diagnostic = diagnostics[0]!;

			expect([diagnostic.from, diagnostic.to]).toEqual(range);
			expect(diagnostic.severity).toBe(rule.defaultSeverity);
			expect(diagnostic.sourceIds.length).toBeGreaterThan(0);
			for (const sourceId of diagnostic.sourceIds) {
				expect(sourceRegistry.get(sourceId), sourceId).toMatchObject({ reviewStatus: 'reviewed' });
			}

			expect(diagnostic.fixes).toHaveLength(1);
			const fix = diagnostic.fixes![0]!;
			expect(fix.kind).toBe(kind);
			if (label) {
				expect(fix.label).toBe(label);
			}
			expect(fix.edit.baseRevision).toBe(73);
			const output = applyEdits(input, fix.edit.edits);
			expect(output).toBe(expected);
			expect(parseDocument(output).text).toBe(expected);
			expect(parseDocument(output).syntaxIssues).toEqual([]);
			expect(rule.check(parseDocument(output), context)).toEqual([]);

			if (kind === 'preview') {
				expect(collectSafeFixes([diagnostic])).toEqual([]);
			} else {
				expect(collectSafeFixes([diagnostic])).toEqual([fix]);
			}
		}
	);
});

interface SafeFixBatch {
	id: string;
	input: string;
	expected: string;
	fixes: number;
	language?: string;
	performers?: string[];
}

/**
 * One multi-match document per rule that emits safe fixes. A single occurrence
 * is covered above; these pin what `collectSafeFixes` hands a bulk applier when
 * the same rule fires several times in one document.
 */
const safeFixBatches: SafeFixBatch[] = [
	{
		id: 'syntax.unbalanced-brackets',
		input: '[Verse\nLine\n\n[Chorus\nMore',
		expected: '[Verse]\nLine\n\n[Chorus]\nMore',
		fixes: 2
	},
	{
		id: 'section.localized-header-preference',
		input: '[Chorus: Ane]\nEn natt\n\n[Bridge]\nEn dag',
		expected: '[Refreng: Ane]\nEn natt\n\n[Bro]\nEn dag',
		fixes: 2,
		language: 'no'
	},
	{
		id: 'section.header-spacing',
		input: '[Intro]\nOpen\n[Verse]\nFirst\n[Chorus]\nSecond',
		expected: '[Intro]\nOpen\n\n[Verse]\nFirst\n\n[Chorus]\nSecond',
		fixes: 2
	},
	{
		id: 'section.immediate-repeat-spacing',
		input: '[Chorus]\nA\nB\n\n[Chorus]\nA\nB\n\n[Verse]\nC\n\n[Verse]\nC',
		expected: '[Chorus]\nA\nB\nA\nB\n\n[Verse]\nC\nC',
		fixes: 2
	},
	{
		id: 'performer.header-required',
		input: '[Verse]\n<i>First</i>\n\n[Chorus]\n<b>Second</b>',
		expected: '[Verse]\nFirst\n\n[Chorus]\nSecond',
		fixes: 2,
		performers: ['A', 'B']
	},
	{
		id: 'performer.redundant-markup',
		input:
			'[Verse: A & <i>B</i>]\n<i>First</i>\n<i>Second</i>\n\n[Chorus: A & <i>B</i>]\n<i>Third</i> <i>Fourth</i>',
		expected:
			'[Verse: A & <i>B</i>]\n<i>First\nSecond</i>\n\n[Chorus: A & <i>B</i>]\n<i>Third Fourth</i>',
		fixes: 2,
		performers: ['A', 'B']
	},
	{
		id: 'performer.parenthetical-boundary',
		input: '[Verse: A & <i>B</i>]\nA (<i>First</i>)\nB (<i>Second</i>)',
		expected: '[Verse: A & <i>B</i>]\nA <i>(First)</i>\nB <i>(Second)</i>',
		fixes: 2,
		performers: ['A', 'B']
	},
	{
		id: 'performer.unused-legend-slot',
		input: '[Verse: A & <i>B</i>]\nOnly A sings\n\n[Chorus: C & <i>D</i>]\nOnly C sings',
		expected: '[Verse: A]\nOnly A sings\n\n[Chorus: C]\nOnly C sings',
		fixes: 2,
		performers: ['A', 'B', 'C', 'D']
	},
	{
		id: 'spelling.standardized',
		input: '[Verse]\nlil whoa dawg choppa oughtta\nboujee skrt trynna ya’ll tho',
		expected: "[Verse]\nlil' woah dog chopper oughta\nbougie skrrt tryna y'all though",
		fixes: 10
	},
	{
		id: 'spelling.standardized',
		input: '[Verse]\nok\nok then\nWell ok',
		expected: '[Verse]\nOkay\nOkay then\nWell okay',
		fixes: 3
	},
	{
		id: 'quotes.typewriter',
		input: '[Verse]\n‘a’ said “b”\nAnd ’tis “c”',
		expected: '[Verse]\n\'a\' said "b"\nAnd \'tis "c"',
		fixes: 7
	},
	{
		id: 'unknown.marker',
		input: '[Verse]\nI heard (?) and (??)\nAgain (????)',
		expected: '[Verse]\nI heard [?] and [?]\nAgain [?]',
		fixes: 3
	}
];

describe('batched safe fixes', () => {
	it.each(safeFixBatches)(
		'$id rewrites every match at once and reaches a fixed point',
		({ id, input, expected, fixes: expectedCount, language = 'en', performers = [] }) => {
			const rule = getRule(id);
			if (!rule) throw new Error(`Missing rule ${id}`);
			const context = ruleContext({ language, performers });
			const diagnostics = rule.check(parseDocument(input), context);
			const fixes = collectSafeFixes(diagnostics);

			expect(fixes).toHaveLength(expectedCount);
			expect(diagnostics.flatMap((diagnostic) => diagnostic.fixes ?? [])).toEqual(fixes);
			expect(fixes.every((fix) => fix.edit.baseRevision === testRevision)).toBe(true);

			// A single rule's own safe fixes must be disjoint, or a bulk applier
			// would have to arbitrate between them.
			const edits = fixes
				.flatMap((fix) => fix.edit.edits)
				.sort((left, right) => left.from - right.from);
			expect(edits.every((edit, index) => index === 0 || edit.from >= edits[index - 1]!.to)).toBe(
				true
			);

			const output = applyEdits(input, edits);
			expect(output).toBe(expected);
			expect(parseDocument(output).syntaxIssues).toEqual([]);
			expect(rule.check(parseDocument(output), context)).toEqual([]);
		}
	);
});

function safeFixesOffered(diagnostics: readonly Diagnostic[]): DiagnosticFix[] {
	return diagnostics.flatMap(
		(diagnostic) => diagnostic.fixes?.filter((fix) => fix.kind === 'safe') ?? []
	);
}

function disjoint(fixes: readonly DiagnosticFix[]): boolean {
	const edits = [...fixes.flatMap((fix) => fix.edit.edits)].sort(
		(left, right) => left.from - right.from
	);
	return edits.every((edit, index) => index === 0 || edit.from >= edits[index - 1]!.to);
}

describe('cross-rule safe fixes', () => {
	// Two rules legitimately target the same text here: the repeat-spacing join
	// deletes the second header that the localization rule wants to rename.
	const input = '[Chorus]\nEn natt\n\n[Chorus]\nEn natt';

	it('offers overlapping fixes individually but never batches them together', () => {
		const context = ruleContext({ language: 'no' });
		const diagnostics = runRules(parseDocument(input), context);
		const offered = safeFixesOffered(diagnostics);
		const batch = collectSafeFixes(diagnostics);

		// Every fix stays available for individual application; the batch is the
		// subset that can be applied as one atomic edit.
		expect(disjoint(offered)).toBe(false);
		expect(batch.length).toBeLessThan(offered.length);
		expect(disjoint(batch)).toBe(true);
		expect(batch.every((fix) => offered.includes(fix))).toBe(true);
	});

	it('applies as one atomic edit without corrupting the document', () => {
		const context = ruleContext({ language: 'no' });
		const batch = collectSafeFixes(runRules(parseDocument(input), context));
		const output = applyEdits(
			input,
			batch.flatMap((fix) => fix.edit.edits)
		);

		expect(output).toBe('[Refreng]\nEn natt\nEn natt');
		// The regression this guards: applying every offered fix used to yield
		// '[Refreng]\nEn natt\n\nEn natt', a half-applied join.
		expect(output).not.toContain('\n\n');
		expect(parseDocument(output).syntaxIssues).toEqual([]);
	});

	it('leaves no safe fix that the batch silently swallowed', () => {
		const context = ruleContext({ language: 'no' });
		const batch = collectSafeFixes(runRules(parseDocument(input), context));
		const output = applyEdits(
			input,
			batch.flatMap((fix) => fix.edit.edits)
		);

		// A dropped fix is deferred, not discarded: re-running the engine against
		// the new text must either re-offer it or show it is no longer needed.
		const remaining = runRules(parseDocument(output), ruleContext({ language: 'no' }));
		expect(safeFixesOffered(remaining)).toEqual([]);
	});

	it('lets the parenthetical boundary fix subsume redundant wrappers', () => {
		const source = '[Verse: A & <i>B</i>]\n(<i>Call</i> <i>back</i>)';
		const context = ruleContext({ performers: ['A', 'B'] });
		const diagnostics = runRules(parseDocument(source), context);
		const offered = safeFixesOffered(diagnostics);
		const batch = collectSafeFixes(diagnostics);

		expect(diagnostics.map((finding) => finding.ruleId)).toContain(
			'performer.parenthetical-boundary'
		);
		expect(diagnostics.map((finding) => finding.ruleId)).toContain('performer.redundant-markup');
		expect(offered).toHaveLength(2);
		expect(batch).toHaveLength(1);
		expect(applyEdits(source, batch[0]!.edit.edits)).toBe(
			'[Verse: A & <i>B</i>]\n<i>(Call back)</i>'
		);
	});

	it('refuses two insertions competing for one offset', () => {
		// No enabled rule pair produces this today, but zero-width edits do not
		// overlap by range arithmetic, so the ordering ambiguity needs its own guard.
		const insertion = (ruleId: string, insert: string): Diagnostic => ({
			ruleId,
			severity: 'warning',
			from: 4,
			to: 4,
			message: `${ruleId} message`,
			explanation: `${ruleId} explanation`,
			sourceIds: [],
			fixes: [
				{
					kind: 'safe',
					label: `Insert ${insert}`,
					edit: { baseRevision: testRevision, edits: [{ from: 4, to: 4, insert }] }
				}
			]
		});

		const batch = collectSafeFixes([insertion('a.rule', 'X'), insertion('b.rule', 'Y')]);

		expect(batch).toHaveLength(1);
		expect(batch[0]?.label).toBe('Insert X');
	});
});
