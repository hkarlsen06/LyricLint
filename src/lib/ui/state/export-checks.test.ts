import { describe, expect, it } from 'vitest';
import type { Diagnostic, DiagnosticFix } from '#lib/core/types.js';
import {
	applyFixes,
	exportFindingKey,
	exportFindings,
	lineOfOffset,
	outputSegments
} from './export-checks.js';

function finding(from: number, to: number, overrides: Partial<Diagnostic> = {}): Diagnostic {
	return {
		ruleId: 'mxm.punctuation.line-end',
		severity: 'warning',
		message: 'Review this terminal period.',
		explanation: '',
		sourceIds: [],
		from,
		to,
		...overrides
	};
}

function fix(...edits: { from: number; to: number; insert: string }[]): DiagnosticFix {
	return { kind: 'safe', label: 'Fix', edit: { baseRevision: 0, edits } };
}

describe('export findings', () => {
	it('leaves out a finding only the workbench can answer', () => {
		const kept = finding(0, 1);
		expect(exportFindings([kept, finding(0, 1, { ruleId: 'section.unlinked-repeat' })])).toEqual([
			kept
		]);
	});

	it('keeps an answer attached to its line when text above it changes', () => {
		const before = 'First line.\nSecond line.';
		const after = 'A new opening\nFirst line.\nSecond line.';
		expect(exportFindingKey(finding(10, 11), before)).toBe(
			exportFindingKey(finding(24, 25), after)
		);
		expect(exportFindingKey(finding(10, 11), before)).not.toBe(
			exportFindingKey(finding(23, 24), before)
		);
	});
});

describe('applying fixes to the output', () => {
	it('applies every edit against the text the fixes were planned on', () => {
		expect(
			applyFixes('dont stop.\ni know.', [
				fix({ from: 0, to: 4, insert: "don't" }),
				fix({ from: 9, to: 10, insert: '' }),
				fix({ from: 11, to: 12, insert: 'I' })
			])
		).toBe("don't stop\nI know.");
	});

	it('skips an edit that reaches into one already applied', () => {
		expect(
			applyFixes('abcdef', [
				fix({ from: 2, to: 5, insert: 'X' }),
				fix({ from: 0, to: 3, insert: 'Y' })
			])
		).toBe('abXf');
	});
});

describe('marking the output', () => {
	it('numbers lines from one', () => {
		expect(lineOfOffset('a\nb\nc', 0)).toBe(1);
		expect(lineOfOffset('a\nb\nc', 2)).toBe(2);
		expect(lineOfOffset('a\nb\nc', 4)).toBe(3);
	});

	it('returns the whole text, cut where a finding starts and ends', () => {
		const text = 'Hold on.\nstay';
		const segments = outputSegments(text, [
			finding(7, 8),
			finding(9, 13, { severity: 'suggestion' })
		]);
		expect(segments.map((segment) => segment.text).join('')).toBe(text);
		expect(segments).toEqual([
			{ text: 'Hold on' },
			{ text: '.', severity: 'warning' },
			{ text: '\n' },
			{ text: 'stay', severity: 'suggestion' }
		]);
	});

	it('gives overlapping text its most severe finding', () => {
		const segments = outputSegments('abcd', [
			finding(0, 4, { severity: 'suggestion' }),
			finding(1, 2, { severity: 'error' })
		]);
		expect(segments.map((segment) => segment.severity)).toEqual([
			'suggestion',
			'error',
			'suggestion'
		]);
	});

	it('marks the open finding and the rest of its line', () => {
		const segments = outputSegments('one\ntwo.\nthree', [finding(7, 8)], { from: 7, to: 8 });
		expect(segments).toEqual([
			{ text: 'one\n' },
			{ text: 'two', line: true },
			{ text: '.', severity: 'warning', open: true },
			{ text: '\nthree' }
		]);
	});

	it('marks the character after a finding with no width', () => {
		expect(outputSegments('ab', [finding(1, 1)])).toEqual([
			{ text: 'a' },
			{ text: 'b', severity: 'warning' }
		]);
	});
});
