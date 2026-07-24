import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import type { Diagnostic, LanguagePack, PerformerRecord } from '../core/types.js';
import { prepareInitialDocument } from './create-editor.js';
import {
	clusterDiagnostics,
	diagnosticsForState,
	lintDecorationField,
	setDiagnosticsEffect
} from './extensions/lint-decorations.js';
import { performerPalette, voiceGroupStyle } from './extensions/performer-decorations.js';
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

function relativeLuminance(oklch: string): number {
	const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/u.exec(oklch);
	if (!match) {
		throw new Error(`Unsupported test color: ${oklch}`);
	}
	const lightness = Number(match[1]);
	const chroma = Number(match[2]);
	const hue = (Number(match[3]) * Math.PI) / 180;
	const a = chroma * Math.cos(hue);
	const b = chroma * Math.sin(hue);
	const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
	const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
	const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
	const l = lRoot ** 3;
	const m = mRoot ** 3;
	const s = sRoot ** 3;
	const red = Math.min(1, Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s));
	const green = Math.min(1, Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s));
	const blue = Math.min(1, Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s));
	return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string): number {
	const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
	const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
	return (lighter + 0.05) / (darker + 0.05);
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

	it('keeps every performer palette entry above 4.5:1 in light and dark schemes', () => {
		const lightText = 'oklch(0.24 0.018 65)';
		const darkText = 'oklch(0.91 0.012 75)';

		for (const entry of performerPalette) {
			expect(contrastRatio(entry.light, lightText)).toBeGreaterThanOrEqual(4.5);
			expect(contrastRatio(entry.dark, darkText)).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('canonicalizes every line-ending style to LF exactly once', () => {
		expect(prepareInitialDocument('one\r\ntwo\r\n')).toEqual({ text: 'one\ntwo\n' });
		expect(prepareInitialDocument('one\ntwo\n')).toEqual({ text: 'one\ntwo\n' });
		expect(prepareInitialDocument('one\r\ntwo\nthree\r')).toEqual({ text: 'one\ntwo\nthree\n' });
		// Idempotent: a second pass changes nothing.
		expect(prepareInitialDocument(prepareInitialDocument('a\r\nb\rc\n').text)).toEqual({
			text: 'a\nb\nc\n'
		});
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
