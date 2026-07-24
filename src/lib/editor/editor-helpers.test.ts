import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import type { Diagnostic, LanguagePack, PerformerRecord } from '../core/types.js';
import {
	clusterDiagnostics,
	diagnosticsForState,
	lintDecorationField,
	setDiagnosticsEffect
} from './extensions/lint-decorations.js';
import { voiceGroupStyle } from './extensions/performer-decorations.js';
import { editorCallbacksField, editorRevisionField } from './extensions/editor-state.js';
import { safeExternalUrl } from './overlays/diagnostic-popover.js';
import { sectionHeaderOptions, suggestNextOrdinal } from './overlays/section-picker.js';
import { validateAtomicEdit } from './transaction-adapter.js';

function diagnostic(from: number, to: number, severity: Diagnostic['severity']): Diagnostic {
	return {
		ruleId: `rule-${severity}`,
		severity,
		from,
		to,
		message: severity,
		explanation: `${severity} explanation`,
		sourceIds: []
	};
}

describe('editor pure helpers', () => {
	it('clusters only intersecting same-line diagnostics in severity order', () => {
		const clusters = clusterDiagnostics(
			[
				diagnostic(2, 6, 'suggestion'),
				diagnostic(4, 8, 'error'),
				diagnostic(9, 10, 'warning'),
				diagnostic(12, 14, 'manual-review')
			],
			(offset) => (offset < 12 ? 1 : 2)
		);

		expect(clusters).toHaveLength(3);
		expect(clusters[0]?.diagnostics.map((item) => item.severity)).toEqual(['error', 'suggestion']);
		expect(clusters[0]?.severity).toBe('error');
		expect(clusters[1]?.diagnostics).toHaveLength(1);
		expect(clusters[2]?.line).toBe(2);
	});

	it('ignores a delayed stale diagnostic payload without replacing valid current results', () => {
		const current = diagnostic(0, 1, 'warning');
		let state = EditorState.create({
			doc: 'line',
			extensions: [editorCallbacksField, editorRevisionField, lintDecorationField]
		});
		state = state.update({
			effects: setDiagnosticsEffect.of({ revision: 0, items: [current] })
		}).state;
		state = state.update({
			effects: setDiagnosticsEffect.of({
				revision: 99,
				items: [diagnostic(1, 2, 'error')]
			})
		}).state;

		expect(diagnosticsForState(state)).toEqual([current]);
	});

	it('suggests the next ordinal and keeps custom section text', () => {
		const pack: LanguagePack = {
			tag: 'en',
			displayName: 'English',
			policy: 'localized',
			headers: [
				{ semanticPart: 'verse', terms: ['Verse'] },
				{ semanticPart: 'chorus', terms: ['Chorus'] }
			],
			sourceIds: ['source'],
			reviewed: true
		};

		expect(suggestNextOrdinal('Verse', ['Verse', 'Verse 2', 'Chorus'])).toBe(3);
		expect(sectionHeaderOptions(pack, ['Verse', 'Verse 2'], 'ver')[0]).toMatchObject({
			label: 'Verse 3',
			headerName: 'Verse',
			ordinal: 3
		});
		expect(sectionHeaderOptions(pack, [], 'Refrain').at(-1)).toMatchObject({
			headerName: 'Refrain',
			custom: true
		});
	});

	it('maps stable performer colors to segmented accessible styles with a cap', () => {
		const performers: PerformerRecord[] = ['A', 'B', 'C', 'D'].map((name, index) => ({
			id: name.toLocaleLowerCase(),
			displayName: name,
			normalizedKey: name.toLocaleLowerCase(),
			aliases: [],
			colorId: `color-${index}`,
			order: index
		}));
		const style = voiceGroupStyle(
			performers.map((performer) => performer.id),
			performers
		);

		expect(style?.label).toBe('Performed by A, B, C, D');
		expect(style?.hiddenCount).toBe(1);
		expect(style?.lightBackground).toContain('linear-gradient');
		expect(style?.darkBackground).toContain('linear-gradient');
	});

	it('rejects stale, overlapping, and out-of-bounds atomic edits before dispatch', () => {
		expect(() =>
			validateAtomicEdit(
				{
					baseRevision: 0,
					edits: []
				},
				4,
				0
			)
		).toThrow(/at least one text change/u);
		expect(() =>
			validateAtomicEdit(
				{
					baseRevision: 1,
					edits: [{ from: 0, to: 1, insert: 'x' }]
				},
				4,
				0
			)
		).toThrow(/targets revision/u);
		expect(() =>
			validateAtomicEdit(
				{
					baseRevision: 0,
					edits: [
						{ from: 0, to: 2, insert: 'x' },
						{ from: 1, to: 3, insert: 'y' }
					]
				},
				4,
				0
			)
		).toThrow(/must not overlap/u);
		expect(() =>
			validateAtomicEdit(
				{
					baseRevision: 0,
					edits: [{ from: 4, to: 5, insert: 'x' }]
				},
				4,
				0
			)
		).toThrow(/beyond the document/u);
	});

	it('allows only safe HTTP source links', () => {
		expect(safeExternalUrl('https://genius.com/annotations/1')).toBe(
			'https://genius.com/annotations/1'
		);
		expect(safeExternalUrl('javascript:alert(1)')).toBeUndefined();
		expect(safeExternalUrl('not a URL')).toBeUndefined();
	});
});
