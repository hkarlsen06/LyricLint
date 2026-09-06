import { describe, expect, test } from 'vitest';
import type { Diagnostic, EditorSnapshot } from '$lib/core/types.js';
import { diagnosticRowSignature, reconcileDiagnosticRows } from './row-identity.js';

function finding(from: number, message = 'Check spelling'): Diagnostic {
	return {
		from,
		to: from + 4,
		ruleId: 'spelling.standardized',
		severity: 'suggestion',
		message,
		explanation: '',
		sourceIds: []
	};
}

type Snapshot = Pick<EditorSnapshot, 'revision' | 'text' | 'diagnostics' | 'documentChange'>;

function reconcile(previous: Snapshot, next: Snapshot) {
	let allocated = 0;
	const keys = new Map(
		previous.diagnostics.map((item, index) => [diagnosticRowSignature(item), `old-${index}`])
	);
	const result = reconcileDiagnosticRows(previous, next, keys, () => `new-${allocated++}`);
	return next.diagnostics.map((item) => result.keys.get(diagnosticRowSignature(item)));
}

describe('diagnostic row continuity follows actual editor transactions', () => {
	test('inserting an identical chorus keeps each original occurrence and creates a new row for the insertion', () => {
		const previous = { revision: 1, text: 'Imma\nImma', diagnostics: [finding(0), finding(5)] };
		const next = {
			revision: 2,
			text: 'Imma\nImma\nImma',
			diagnostics: [finding(0), finding(5), finding(10)],
			documentChange: { baseRevision: 1, edits: [{ from: 0, to: 0, insert: 'Imma\n' }] }
		};
		expect(reconcile(previous, next)).toEqual(['new-0', 'old-0', 'old-1']);
	});

	test('deleting the first repeated occurrence retains the second occurrence’s controls', () => {
		const previous = { revision: 1, text: 'Imma\nImma', diagnostics: [finding(0), finding(5)] };
		const next = {
			revision: 2,
			text: 'Imma',
			diagnostics: [finding(0)],
			documentChange: { baseRevision: 1, edits: [{ from: 0, to: 5, insert: '' }] }
		};
		expect(reconcile(previous, next)).toEqual(['old-1']);
	});

	test('keeps untouched findings between separate changes in one atomic edit', () => {
		const previous = { revision: 1, text: 'A\nImma\nZ', diagnostics: [finding(2)] };
		const next = {
			revision: 2,
			text: 'AA\nImma\nZZZ',
			diagnostics: [finding(3)],
			documentChange: {
				baseRevision: 1,
				edits: [
					{ from: 0, to: 1, insert: 'AA' },
					{ from: 7, to: 8, insert: 'ZZZ' }
				]
			}
		};
		expect(reconcile(previous, next)).toEqual(['old-0']);
	});

	test('new content, changed messages, and replacement documents do not inherit a row', () => {
		const previous = { revision: 1, text: 'Imma', diagnostics: [finding(0)] };
		expect(
			reconcile(previous, {
				revision: 2,
				text: 'Idkk',
				diagnostics: [finding(0)],
				documentChange: { baseRevision: 1, edits: [{ from: 0, to: 4, insert: 'Idkk' }] }
			})
		).toEqual(['new-0']);
		expect(
			reconcile(previous, { ...previous, diagnostics: [finding(0, 'A different question')] })
		).toEqual(['new-0']);
		expect(
			reconcile(previous, {
				revision: 2,
				text: 'Imma\nNew',
				diagnostics: [finding(0)],
				documentChange: { baseRevision: 1, edits: [{ from: 0, to: 4, insert: 'Imma\nNew' }] }
			})
		).toEqual(['new-0']);
	});

	test('missing or stale change metadata does not guess which repeated text survived', () => {
		const previous = { revision: 1, text: 'Imma', diagnostics: [finding(0)] };
		const next = { revision: 2, text: 'XImma', diagnostics: [finding(1)] };
		expect(reconcile(previous, next)).toEqual(['new-0']);
		expect(
			reconcile(previous, {
				...next,
				documentChange: { baseRevision: 0, edits: [{ from: 0, to: 0, insert: 'X' }] }
			})
		).toEqual(['new-0']);
	});

	test('a later lint result retains existing rows while adding its own findings', () => {
		const previous = { revision: 1, text: 'Imma\nIdkk', diagnostics: [finding(0)] };
		expect(reconcile(previous, { ...previous, diagnostics: [finding(0), finding(5)] })).toEqual([
			'old-0',
			'new-0'
		]);
	});
});
