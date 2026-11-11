import { describe, expect, test } from 'vitest';
import type { Diagnostic } from '#lib/core/types.js';
import { carryHarperDiagnosticsAcrossEdit } from './harper-continuity.js';

function harper(from: number, to: number, revision = 4): Diagnostic {
	return {
		from,
		to,
		ruleId: 'spelling.harper',
		severity: 'suggestion',
		message: 'Check this spelling.',
		explanation: 'Spelling detected by Harper.',
		sourceIds: ['T-HARPER'],
		fixes: [
			{
				kind: 'preview',
				label: 'Replace it',
				edit: { baseRevision: revision, edits: [{ from, to, insert: 'right' }] }
			}
		]
	};
}

describe('Harper continuity across completed edits', () => {
	test('moves an unaffected finding and retargets its fix to the new revision', () => {
		const previous = '[Verse]\nImma goes on\nThen wrng';
		const next = "[Verse]\nI'm really going on\nThen wrng";
		const oldFrom = previous.indexOf('wrng');
		const newFrom = next.indexOf('wrng');

		const [carried] = carryHarperDiagnosticsAcrossEdit(
			{ revision: 4, text: previous },
			{ revision: 5, text: next },
			[harper(oldFrom, oldFrom + 4)],
			false
		);

		expect(carried).toMatchObject({ from: newFrom, to: newFrom + 4 });
		expect(carried?.fixes?.[0]?.edit).toEqual({
			baseRevision: 5,
			edits: [{ from: newFrom, to: newFrom + 4, insert: 'right' }]
		});
	});

	test('drops every finding on a line the edit changed, even one it only borders', () => {
		const grown = carryHarperDiagnosticsAcrossEdit(
			{ revision: 4, text: '[Verse]\nWalki home' },
			{ revision: 5, text: '[Verse]\nWalking home' },
			[harper(8, 13)],
			true
		);
		const context = carryHarperDiagnosticsAcrossEdit(
			{ revision: 4, text: '[Verse]\na apple\nOther line' },
			{ revision: 5, text: '[Verse]\na banana\nOther line' },
			[harper(8, 9)],
			true
		);

		expect(grown).toEqual([]);
		expect(context).toEqual([]);
	});

	test('keeps a finding on the line a fix changed when the fix did not touch it', () => {
		const [carried] = carryHarperDiagnosticsAcrossEdit(
			{ revision: 4, text: '[Verse]\nok then song' },
			{ revision: 5, text: '[Verse]\nOkay then song' },
			[harper(16, 20)],
			false
		);

		expect(carried).toMatchObject({ from: 18, to: 22 });
	});

	test('drops findings touched by the edit and never carries native findings', () => {
		const text = '[Verse]\nImma goes';
		const from = text.indexOf('Imma');
		const native = { ...harper(from, from + 4), ruleId: 'spelling.standardized' };

		expect(
			carryHarperDiagnosticsAcrossEdit(
				{ revision: 4, text },
				{ revision: 5, text: "[Verse]\nI'ma goes" },
				[harper(from, from + 4), native],
				false
			)
		).toEqual([]);
	});
});
