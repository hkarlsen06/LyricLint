import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangeSet } from '@codemirror/state';
import { createLyricEditor, type LyricEditorInstance } from './create-editor.js';
import type { EditorSnapshot, PerformerRecord } from '#lib/core/types.js';
import type { ConversionEnvelope } from '#lib/persistence/conversion.js';
import { parseScribe, serializeScribe } from '#lib/scribe/format.js';
import { setComposingEffect } from './extensions/editor-state.js';

const genius =
	'[Chorus: Mira & <i>Noor</i>]\nWe follow the [moon](123456)\n<i>Stay beside me</i>\n\n[Chorus: Mira & <i>Noor</i>]\nWe follow the moon\n<i>Stay beside me</i>';
const mxm = 'We follow the moon\nStay beside me\n\nWe follow the moon\nStay beside me';
const editors: LyricEditorInstance[] = [];
afterEach(() => {
	for (const editor of editors.splice(0)) {
		const host = editor.view.dom.parentElement;
		editor.destroy();
		host?.remove();
	}
});

function mount(
	text = genius,
	initialConversion?: ConversionEnvelope,
	language = 'en',
	performers: PerformerRecord[] = []
) {
	const snapshots: EditorSnapshot[] = [];
	const host = document.createElement('div');
	document.body.append(host);
	const editor = createLyricEditor(host, {
		initialText: text,
		initialConversion,
		context: { language, performers, ruleSetVersion: 'test' },
		callbacks: {
			onSnapshot: (snapshot) => snapshots.push(snapshot),
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onAnnouncement: vi.fn()
		}
	});
	editors.push(editor);
	return { ...editor, snapshots };
}

describe('lossless profile transactions', () => {
	it('clears a hidden editor after profile switches and restores its exact selection and details', async () => {
		const { handle, view } = mount();
		handle.setLineAnchors!([{ line: 2, time: 12.5 }]);
		await vi.waitFor(() => expect(view.inView).toBe(true));
		const staleSnapshot = view
			.scrollSnapshot()
			.map(ChangeSet.of({ from: 0, insert: 'x'.repeat(genius.length) }, genius.length));
		if (!staleSnapshot) throw new Error('The scroll snapshot must survive its mapping.');
		view.dom.parentElement!.style.display = 'none';
		// The production phone reproduction captures a pending snapshot beyond the
		// shorter projection while hidden. Keep that layout input deterministic here.
		vi.spyOn(view, 'scrollSnapshot').mockReturnValue(staleSnapshot);
		handle.switchProfile!('musixmatch');
		view.dispatch({ selection: { anchor: mxm.length, head: 1 } });
		const before = handle.getSnapshot();
		const selection = view.state.selection.toJSON();
		expect(handle.dispatchConversionAction!({ kind: 'clearDocument' }, before.revision)).toEqual({
			ok: true
		});
		expect(handle.getSnapshot().text).toBe('');
		expect(handle.getSnapshot().conversion?.profile).toBe('musixmatch');
		expect(handle.getLineAnchors!()).toEqual([]);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(before.text);
		expect(handle.getSnapshot().conversion).toEqual(before.conversion);
		expect(view.state.selection.toJSON()).toEqual(selection);
		handle.redo();
		expect(handle.getSnapshot().text).toBe('');
		expect(handle.getSnapshot().conversion?.profile).toBe('musixmatch');
	});

	it.each([
		['[Verse]\nOne\n[Instrumental]', 0, 4, 'My new song', '[Verse]\nMy new song'],
		['[Verse]\nOne\n[Chorus]\nTwo', 1, 5, 'by', '[Verse]\nObywo']
	] as const)(
		'retains displaced headings through history, repair and Scribe: %j',
		(source, from, to, insert, geniusText) => {
			const { handle, view } = mount(source);
			handle.switchProfile!('musixmatch');
			const before = handle.getSnapshot();
			const id = before.conversion!.model.sections[1]!.id;
			view.dispatch({ changes: { from, to, insert }, userEvent: 'input.type' });
			const authored = handle.getSnapshot().text;
			handle.undo();
			expect(handle.getSnapshot().text).toBe(before.text);
			handle.redo();
			expect(handle.getSnapshot().text).toBe(authored);
			handle.switchProfile!('genius');
			expect(handle.getSnapshot().text).toBe(geniusText);
			const saved = handle.getSnapshot();
			const scribe = parseScribe(
				serializeScribe({
					title: 'Placement',
					language: 'en',
					lyrics: saved.text,
					conversion: saved.conversion,
					performers: [],
					lineAnchors: [],
					sectionLinks: [],
					ignoredDiagnostics: []
				})
			);
			const restored = mount(scribe.document.lyrics, scribe.document.conversion).handle;
			expect(restored.getSnapshot().conversion!.model.sections[1]!.id).toBe(id);
			expect(
				restored.dispatchConversionAction!(
					{ kind: 'moveSection', sectionId: id, at: 0 },
					restored.getSnapshot().revision
				)
			).toEqual({ ok: true });
			expect(
				restored.getSnapshot().conversion!.model.sections.find((s) => s.id === id)!.placement
			).toBeUndefined();
			restored.undo();
			expect(restored.getSnapshot().text).toBe(geniusText);
			expect(
				restored.getSnapshot().conversion!.model.sections.find((s) => s.id === id)!.placement
			).toBe('unresolved');
			restored.redo();
			restored.switchProfile!('musixmatch');
			expect(restored.getSnapshot().text).toBe(authored);
		}
	);
	it('creates a typed section and edits its Genius label through history, Scribe and reload', () => {
		const lyrics = 'A paper moon above the road\nI find my way back home\n\nStay beside me';
		const { handle } = mount(lyrics);
		handle.switchProfile!('musixmatch');
		handle.setLineAnchors!([{ line: 1, time: 12 }]);
		expect(
			handle.dispatchConversionAction!(
				{ kind: 'insertSection', at: 0, type: 'Verse' },
				handle.getSnapshot().revision
			)
		).toEqual({ ok: true });
		const id = handle.getSnapshot().conversion!.model.sections[0]!.id;
		expect(handle.getSnapshot().text).toBe(lyrics);
		handle.switchProfile!('genius');
		expect(handle.getSnapshot().text).toBe('[Verse]\n' + lyrics);
		expect(
			handle.dispatchConversionAction!(
				{ kind: 'setSectionLabel', sectionId: id, label: 'Verse 2' },
				handle.getSnapshot().revision
			)
		).toEqual({ ok: true });
		const saved = handle.getSnapshot();
		expect(saved.text).toBe('[Verse 2]\n' + lyrics);
		handle.undo();
		expect(handle.getSnapshot().text).toBe('[Verse]\n' + lyrics);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(lyrics);
		handle.undo();
		expect(handle.getSnapshot().conversion!.model.sections).toHaveLength(0);
		handle.redo();
		handle.redo();
		handle.redo();
		expect(handle.getSnapshot().text).toBe(saved.text);
		expect(handle.getSnapshot().conversion!.model).toEqual(saved.conversion!.model);
		const scribe = parseScribe(
			serializeScribe({
				title: 'Moon',
				language: 'en',
				lyrics: saved.text,
				conversion: saved.conversion,
				performers: [],
				lineAnchors: handle.getLineAnchors!(),
				sectionLinks: [],
				ignoredDiagnostics: []
			})
		);
		expect(scribe.document.conversion).toEqual(saved.conversion);
		const restored = mount(scribe.document.lyrics, scribe.document.conversion).handle;
		expect(restored.getSnapshot().text).toBe(saved.text);
		expect(restored.getSnapshot().conversion!.model.sections[0]!.id).toBe(id);
		restored.switchProfile!('musixmatch');
		expect(restored.getSnapshot().text).toBe(lyrics);
		expect(restored.getLineAnchors!()).toEqual([{ line: 1, time: 12 }]);
	});

	it('retains performer IDs, annotations, timing and links when types and explicit labels change', () => {
		const performers: PerformerRecord[] = [
			{
				id: 'mira',
				displayName: 'Mira',
				normalizedKey: 'mira',
				aliases: [],
				colorId: 'rose',
				order: 0
			}
		];
		const source = '  [Couplet 2: Mira]  \nA [moon](000123)\n\n[Refrain: Mira]\nA moon';
		const { handle } = mount(source, undefined, 'fr', performers);
		handle.setLineAnchors!([{ line: 2, time: 12 }]);
		handle.setSectionLinks!([{ lines: [1, 4] }]);
		handle.switchProfile!('musixmatch');
		const before = handle.getSnapshot().conversion!.model;
		const id = before.sections[0]!.id;
		expect(before.voices[0]!.performerIds).toEqual(['mira']);
		expect(
			handle.dispatchConversionAction!(
				{ kind: 'setSectionType', sectionId: id, type: 'Verse' },
				handle.getSnapshot().revision
			)
		).toEqual({ ok: true });
		handle.switchProfile!('genius');
		expect(handle.getSnapshot().text).toBe(source);
		expect(
			handle.dispatchConversionAction!(
				{ kind: 'setSectionLabel', sectionId: id, label: 'Verse 3' },
				handle.getSnapshot().revision
			)
		).toEqual({ ok: true });
		const saved = handle.getSnapshot();
		for (const key of ['voices', 'wrappers', 'lines', 'links', 'forms', 'languageRanges'] as const)
			expect(saved.conversion!.model[key]).toEqual(before[key]);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(source);
		handle.redo();
		expect(handle.getSnapshot().text).toBe(source.replace('Couplet 2', 'Verse 3'));
		const scribe = parseScribe(
			serializeScribe({
				title: 'Moon',
				language: 'fr',
				lyrics: saved.text,
				conversion: saved.conversion,
				performers,
				lineAnchors: handle.getLineAnchors!(),
				sectionLinks: handle.getSectionLinks!(),
				ignoredDiagnostics: []
			})
		);
		expect(scribe.performers).toEqual(performers);
		const restored = mount(
			scribe.document.lyrics,
			scribe.document.conversion,
			'fr',
			scribe.performers
		).handle;
		expect(restored.getSnapshot().conversion!.model).toEqual(saved.conversion!.model);
		expect(restored.getLineAnchors!()).toEqual([{ line: 2, time: 12 }]);
		expect(restored.getSectionLinks!()).toEqual(handle.getSectionLinks!());
	});

	it('switches the real editor 100 times without changing content, records, IDs, timings, or links', () => {
		const { handle } = mount();
		handle.setLineAnchors!([
			{ line: 2, time: 12.5 },
			{ line: 6, time: 42 }
		]);
		handle.setSectionLinks!([
			{
				lines: [1, 5],
				passages: [
					{
						members: [
							{ headerLine: 1, line: 2, column: 3, endLine: 2, endColumn: 9 },
							{ headerLine: 5, line: 6, column: 3, endLine: 6, endColumn: 9 }
						]
					}
				]
			}
		]);
		expect(handle.switchProfile!('musixmatch')).toEqual({ ok: true });
		expect(handle.getSnapshot().text).toBe(mxm);
		const model = handle.getSnapshot().conversion!.model;
		const serialized = JSON.stringify(model);
		for (let index = 0; index < 100; index++) {
			expect(handle.switchProfile!('genius')).toEqual({ ok: true });
			expect(handle.getSnapshot().text).toBe(genius);
			expect(handle.getLineAnchors!()).toEqual([
				{ line: 2, time: 12.5 },
				{ line: 6, time: 42 }
			]);
			expect(handle.switchProfile!('musixmatch')).toEqual({ ok: true });
			expect(handle.getSnapshot().text).toBe(mxm);
			expect(handle.getSnapshot().conversion!.model).toBe(model);
			expect(JSON.stringify(model)).toBe(serialized);
		}
	});

	it('mirrors an explicit linked passage in Musixmatch and preserves annotations and timing through reload and undo', () => {
		const { handle } = mount();
		handle.setLineAnchors!([
			{ line: 2, time: 12.5 },
			{ line: 6, time: 42 }
		]);
		handle.setSectionLinks!([
			{
				lines: [1, 5],
				passages: [
					{
						members: [
							{ headerLine: 1, line: 2, column: 3, endLine: 2, endColumn: 9 },
							{ headerLine: 5, line: 6, column: 3, endLine: 6, endColumn: 9 }
						]
					}
				]
			}
		]);
		handle.switchProfile!('musixmatch');
		const before = handle.getSnapshot();
		const at = before.text.lastIndexOf('follow');
		handle.dispatchAtomic({
			baseRevision: before.revision,
			edits: [{ from: at, to: at + 6, insert: 'chase' }]
		});
		const edited = handle.getSnapshot();
		expect(edited.conversionRecovery).toBeUndefined();
		expect(edited.text).toBe(mxm.replaceAll('follow', 'chase'));
		const restored = mount(edited.text, JSON.parse(JSON.stringify(edited.conversion))).handle;
		expect(restored.switchProfile!('genius')).toEqual({ ok: true });
		expect(restored.getSnapshot().text).toBe(genius.replaceAll('follow', 'chase'));
		expect(restored.getLineAnchors!()).toEqual([
			{ line: 2, time: 12.5 },
			{ line: 6, time: 42 }
		]);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(mxm);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(genius);
		handle.redo();
		expect(handle.getSnapshot().text).toBe(mxm);
		handle.redo();
		expect(handle.getSnapshot().text).toBe(edited.text);
		expect(handle.getSnapshot().revision).toBeGreaterThan(edited.revision);
	});

	it.each(['en', 'no', 'ar', 'de', 'es', 'fr', 'ja', 'ko'])(
		'preserves authored Unicode and malformed syntax in %s',
		(language) => {
			const text = '[Verse]\nÅ é e\u0301 العربية 한글 日本語 🌙 [?] <unknown>\n[unfinished';
			const { handle } = mount(text, undefined, language);
			handle.switchProfile!('musixmatch');
			handle.switchProfile!('genius');
			expect(handle.getSnapshot().text).toBe(text);
		}
	);

	it('keeps a clipped annotation on surviving words through replacement, switching, undo and reload', () => {
		const source =
			'[Verse 1: Mira]\ni found your [silver compass](123456) by the door\nBut every road kept turning black';
		const expected = source.replace('[silver compass](123456) by', '[silver](123456) by');
		const { handle, view } = mount(source);
		handle.setLineAnchors!([{ line: 2, time: 8 }]);
		handle.switchProfile!('musixmatch');
		const before = handle.getSnapshot();
		const from = before.text.indexOf('compass by');
		view.dispatch({ selection: { anchor: from + 'compass by'.length, head: from } });
		view.dispatch(view.state.replaceSelection('by'));
		const edited = handle.getSnapshot();
		expect(edited.conversionRecovery).toBeUndefined();
		expect(edited.text).toBe(before.text.replace('compass by', 'by'));
		expect(edited.conversion!.model.wrappers[0]!.id).toBe(before.conversion!.model.wrappers[0]!.id);
		expect(edited.conversion!.model.voices).toEqual(
			before.conversion!.model.voices.map((voice) => ({
				...voice,
				to: voice.to - ('compass by'.length - 'by'.length)
			}))
		);
		handle.switchProfile!('genius');
		expect(handle.getSnapshot().text).toBe(expected);
		expect(handle.getLineAnchors!()).toEqual([{ line: 2, time: 8 }]);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(edited.text);
		handle.undo();
		expect(handle.getSnapshot().text).toBe(before.text);
		expect(handle.getSnapshot().conversion!.model.wrappers).toEqual(
			before.conversion!.model.wrappers
		);
		handle.redo();
		expect(handle.getSnapshot().text).toBe(edited.text);
		handle.redo();
		expect(handle.getSnapshot().text).toBe(expected);
		const saved = handle.getSnapshot();
		const restored = mount(saved.text, JSON.parse(JSON.stringify(saved.conversion))).handle;
		restored.switchProfile!('musixmatch');
		expect(restored.getSnapshot().text).toBe(edited.text);
		restored.switchProfile!('genius');
		expect(restored.getSnapshot().text).toBe(expected);
	});

	it('publishes and undoes a text-identical profile change and rejects stale fixes', () => {
		const { handle, snapshots } = mount('Hold the light');
		const before = handle.getSnapshot();
		handle.switchProfile!('musixmatch');
		expect(snapshots.at(-1)?.conversion?.profile).toBe('musixmatch');
		expect(handle.getSnapshot().revision).toBeGreaterThan(before.revision);
		expect(() =>
			handle.dispatchAtomic({
				baseRevision: before.revision,
				edits: [{ from: 0, to: 4, insert: 'Keep' }]
			})
		).toThrow();
		handle.undo();
		expect(handle.getSnapshot().conversion?.profile ?? 'genius').toBe('genius');
		handle.redo();
		expect(handle.getSnapshot().conversion?.profile).toBe('musixmatch');
	});

	it('leaves an active composition intact and reconciles it on commit', () => {
		const { handle, view } = mount('[Verse]\n月');
		handle.switchProfile!('musixmatch');
		view.dispatch({ effects: setComposingEffect.of(true) });
		view.dispatch({ changes: { from: 0, to: 1, insert: '月光' } });
		expect(handle.switchProfile!('genius').ok).toBe(false);
		view.dispatch({ effects: setComposingEffect.of(false) });
		expect(handle.getSnapshot().conversionRecovery).toBeUndefined();
		handle.switchProfile!('genius');
		expect(handle.getSnapshot().text).toBe('[Verse]\n月光');
	});
});
