import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EditorState, StateEffect } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import type { Diagnostic, LanguagePack, PerformerRecord } from '$lib/core/types.js';
import { norwegianLanguagePack } from '$lib/languages/no.js';
import type { LyricEditorCallbacks } from './contracts.js';
import {
	createCallbackProxy,
	lyricEditorCallbackKeys,
	prepareInitialDocument
} from './create-editor.js';
import {
	diagnosticsForState,
	lintDecorationField,
	setDiagnosticsEffect
} from './extensions/lint-decorations.js';
import { performerPalette, voiceGroupStyle } from './extensions/performer-decorations.js';
import {
	editorCallbacksField,
	editorRevisionField,
	parsedDocumentForState
} from './extensions/editor-state.js';
import { setPlayheadEffect } from './extensions/line-anchors.js';
import { transactionsHaveOnlyPlayheadEffects } from './extensions/selection-anchor.js';
import { safeExternalUrl } from '$lib/diagnostics/source-url.js';
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

/** The three channels of an `oklch()` color, lightness normalized to 0–1. */
interface OklchChannels {
	lightness: number;
	chroma: number;
	hue: number;
}

/** Accepts both `oklch(0.9 …)` and the stylesheet's `oklch(90% …)` spelling. */
function parseOklch(oklch: string): OklchChannels {
	const match = /^oklch\(([\d.]+)(%?) ([\d.]+) ([\d.]+)\)$/u.exec(oklch.trim());
	if (!match) {
		throw new Error(`Unsupported test color: ${oklch}`);
	}
	return {
		lightness: Number(match[1]) / (match[2] === '%' ? 100 : 1),
		chroma: Number(match[3]),
		hue: Number(match[4])
	};
}

function hueOf(oklch: string): number {
	return parseOklch(oklch).hue;
}

function relativeLuminance(oklch: string): number {
	const { lightness, chroma } = parseOklch(oklch);
	const hue = (parseOklch(oklch).hue * Math.PI) / 180;
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
	it('memoizes one parsed document per editor state', () => {
		const state = EditorState.create({ doc: '[Verse]\nHello' });

		expect(parsedDocumentForState(state)).toBe(parsedDocumentForState(state));
	});

	it('keeps the live callback proxy exhaustive with the callback contract', () => {
		const callbacks: LyricEditorCallbacks = {
			onSnapshot: vi.fn(),
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onAnnouncement: vi.fn()
		};
		const proxy = createCallbackProxy(() => callbacks);

		expect(Object.keys(proxy).sort()).toEqual([...lyricEditorCallbackKeys].sort());
	});

	it('recognizes effect-only playhead transactions', () => {
		const state = EditorState.create({ doc: 'Hello' });
		const tick = state.update({ effects: setPlayheadEffect.of(1) });
		const otherEffect = StateEffect.define<boolean>();
		const mixed = state.update({ effects: [setPlayheadEffect.of(1), otherEffect.of(true)] });

		expect(transactionsHaveOnlyPlayheadEffects([tick])).toBe(true);
		expect(transactionsHaveOnlyPlayheadEffects([mixed])).toBe(false);
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

	it('ranks likely repeating sections ahead of one-off sections already in the song', () => {
		const pack: LanguagePack = {
			tag: 'en',
			displayName: 'English',
			policy: 'localized',
			headers: [
				{ semanticPart: 'Intro', terms: ['Intro'] },
				{ semanticPart: 'Verse', terms: ['Verse'] },
				{ semanticPart: 'Chorus', terms: ['Chorus'] },
				{ semanticPart: 'Pre-Chorus', terms: ['Pre-Chorus'] },
				{ semanticPart: 'Bridge', terms: ['Bridge'] },
				{ semanticPart: 'Outro', terms: ['Outro'] }
			],
			sourceIds: ['source'],
			reviewed: true
		};

		const labels = sectionHeaderOptions(pack, ['Intro', 'Verse', 'Chorus', 'Verse 2'], '').map(
			(option) => option.label
		);

		expect(labels.slice(0, 3)).toEqual(['Verse 3', 'Chorus', 'Pre-Chorus']);
		expect(labels.indexOf('Intro')).toBeGreaterThan(labels.indexOf('Bridge'));
	});

	it('keeps query relevance ahead of contextual likelihood', () => {
		const pack: LanguagePack = {
			tag: 'en',
			displayName: 'English',
			policy: 'localized',
			headers: [
				{ semanticPart: 'Verse', terms: ['Verse'] },
				{ semanticPart: 'Instrumental Verse', terms: ['Instrumental Verse'] }
			],
			sourceIds: ['source'],
			reviewed: true
		};

		expect(sectionHeaderOptions(pack, ['Verse'], 'instrumental')[0]?.headerName).toBe(
			'Instrumental Verse'
		);
	});

	it('recognizes a pre-chorus from its position between a verse and chorus', () => {
		const pack: LanguagePack = {
			tag: 'no',
			displayName: 'Norwegian',
			policy: 'localized',
			headers: [
				{ semanticPart: 'Intro', terms: ['Intro'] },
				{ semanticPart: 'Verse', terms: ['Vers'] },
				{ semanticPart: 'Chorus', terms: ['Chorus', 'Refreng'] },
				{ semanticPart: 'Pre-Chorus', terms: ['Pre-Chorus'] },
				{ semanticPart: 'Post-Chorus', terms: ['Post-Chorus'] },
				{ semanticPart: 'Bridge', terms: ['Bro'] }
			],
			sourceIds: ['source'],
			reviewed: true
		};

		const options = sectionHeaderOptions(pack, ['Intro', 'Vers 1', 'Refreng'], '', {
			previousHeader: 'Vers 1',
			nextHeader: 'Refreng'
		});

		expect(options[0]?.headerName).toBe('Pre-Chorus');
		expect(options.findIndex((option) => option.headerName === 'Pre-Chorus')).toBeLessThan(
			options.findIndex((option) => option.headerName === 'Chorus')
		);
		expect(options.findIndex((option) => option.headerName === 'Pre-Chorus')).toBeLessThan(
			options.findIndex((option) => option.headerName === 'Refreng')
		);
	});

	it('numbers a verse from its position instead of the song-wide maximum', () => {
		const pack: LanguagePack = {
			tag: 'no',
			displayName: 'Norwegian',
			policy: 'localized',
			headers: [
				{ semanticPart: 'Verse', terms: ['Vers'] },
				{ semanticPart: 'Chorus', terms: ['Refreng'] }
			],
			sourceIds: ['source'],
			reviewed: true
		};

		const options = sectionHeaderOptions(pack, ['Vers 1', 'Refreng', 'Vers 2', 'Vers 3'], 'vers', {
			previousHeader: 'Vers 1',
			nextHeader: 'Refreng',
			headersBefore: ['Vers 1']
		});

		expect(options[0]).toMatchObject({
			label: 'Vers 2',
			headerName: 'Vers',
			ordinal: 2,
			numberedHeaderTerms: ['Vers']
		});
	});

	it('prefers Refreng over Chorus in the Norwegian section picker', () => {
		const labels = sectionHeaderOptions(norwegianLanguagePack, ['Vers 1'], '', {
			previousHeader: 'Vers 1',
			headersBefore: ['Vers 1']
		}).map((option) => option.label);

		expect(labels.indexOf('Refreng')).toBeLessThan(labels.indexOf('Chorus'));
		expect(labels.indexOf('Bro')).toBeGreaterThan(-1);
		expect(labels).not.toContain('Bridge');
	});

	it('uses the previous section to favor the natural next transition', () => {
		const pack: LanguagePack = {
			tag: 'en',
			displayName: 'English',
			policy: 'localized',
			headers: [
				{ semanticPart: 'Intro', terms: ['Intro'] },
				{ semanticPart: 'Verse', terms: ['Verse'] },
				{ semanticPart: 'Chorus', terms: ['Chorus'] },
				{ semanticPart: 'Pre-Chorus', terms: ['Pre-Chorus'] },
				{ semanticPart: 'Post-Chorus', terms: ['Post-Chorus'] }
			],
			sourceIds: ['source'],
			reviewed: true
		};

		expect(
			sectionHeaderOptions(pack, ['Intro'], '', { previousHeader: 'Intro' })[0]?.headerName
		).toBe('Verse');
		expect(
			sectionHeaderOptions(pack, ['Verse', 'Chorus'], '', {
				previousHeader: 'Chorus'
			})[0]?.headerName
		).toBe('Verse');
	});

	it('blends joint-group performer colors into paired solid and tint values with a cap', () => {
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
		// Joint groups blend into one color instead of striping per member.
		expect(style?.indicator).toContain('color-mix');
		expect(style?.indicator).not.toContain('linear-gradient');
		expect(style?.background).toContain('color-mix');
		expect(style?.background).not.toContain('linear-gradient');
		expect(style?.indicator).toContain('var(--performer-');
		expect(style?.background).toContain('var(--performer-');
	});

	/*
	 * The tints live in `tokens.css` now, so the contrast guarantee has to be
	 * read from there — checking the palette table would only confirm that eight
	 * `var()` strings are still eight `var()` strings. Reading the stylesheet also
	 * means this covers the values that actually ship, and that the roster swatch
	 * and the editor tint can never drift back onto different hues.
	 */
	it('keeps every performer tint above 4.5:1 against its own theme text', () => {
		const tokens = readFileSync(
			fileURLToPath(new URL('../ui/styles/tokens.css', import.meta.url)),
			'utf8'
		);
		// The dark overrides live in the trailing media query; everything before it
		// is the light theme.
		const darkStart = tokens.indexOf('@media (prefers-color-scheme: dark)');
		expect(darkStart).toBeGreaterThan(0);
		const themes = [tokens.slice(0, darkStart), tokens.slice(darkStart)];

		for (const theme of themes) {
			const text = /--color-text:\s*(oklch\([^)]+\))/.exec(theme)?.[1];
			expect(text).toBeDefined();
			const tints = [...theme.matchAll(/--performer-([a-z]+)-tint:\s*(oklch\([^)]+\))/g)];
			expect(tints).toHaveLength(performerPalette.length);

			for (const [, id, tint] of tints) {
				expect(performerPalette.some((entry) => entry.id === id)).toBe(true);
				// The solid at the same identity has to sit on the same hue as its
				// tint; that pairing is what the roster and the editor share.
				const solid = new RegExp(`--performer-${id}:\\s*oklch\\([^)]*?([\\d.]+)\\)`).exec(theme);
				expect(solid, `--performer-${id} missing in the same theme`).not.toBeNull();
				expect(hueOf(tint)).toBeCloseTo(Number(solid?.[1]), 5);

				expect(contrastRatio(tint, text as string)).toBeGreaterThanOrEqual(4.5);
			}
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
