import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLyricEditor, type LyricEditorInstance } from './create-editor.js';
import type { EditorSnapshot } from '$lib/core/types.js';
import type { ConversionEnvelope } from '$lib/persistence/conversion.js';
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

function mount(text = genius, initialConversion?: ConversionEnvelope, language = 'en') {
	const snapshots: EditorSnapshot[] = [];
	const host = document.createElement('div');
	document.body.append(host);
	const editor = createLyricEditor(host, {
		initialText: text,
		initialConversion,
		context: { language, performers: [], ruleSetVersion: 'test' },
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
