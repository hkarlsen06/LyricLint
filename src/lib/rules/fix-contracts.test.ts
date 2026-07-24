import { parseDocument } from '$lib/core/parser.js';
import type { RuleContext, TextEdit } from '$lib/core/types.js';
import { collectSafeFixes } from './engine.js';
import { getRule } from './registry.js';
import { sourceRegistry } from './data/sources.js';
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
		id: 'section.header-language',
		input: '[Verse]\nEn natt',
		language: 'no',
		range: [1, 6],
		expected: '[Vers]\nEn natt',
		kind: 'preview'
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
		range: [9, 12],
		expected: '[Verse]\nf**** this',
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

function applyEdits(text: string, edits: readonly TextEdit[]): string {
	let output = text;
	for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
		output = `${output.slice(0, edit.from)}${edit.insert}${output.slice(edit.to)}`;
	}
	return output;
}

function performerRecords(names: readonly string[]): RuleContext['performers'] {
	return names.map((displayName, order) => ({
		id: `performer-${order}`,
		displayName,
		normalizedKey: displayName.toLocaleLowerCase(),
		aliases: [],
		colorId: `color-${order}`,
		order
	}));
}

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
