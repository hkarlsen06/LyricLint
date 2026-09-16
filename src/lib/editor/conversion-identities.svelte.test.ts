import { afterEach, expect, it, vi } from 'vitest';
import { createLyricEditor, type LyricEditorInstance } from './create-editor.js';
import type { ConversionEnvelope } from '$lib/persistence/conversion.js';

const editors: LyricEditorInstance[] = [];
afterEach(() => {
	for (const editor of editors.splice(0)) {
		const host = editor.view.dom.parentElement;
		editor.destroy();
		host?.remove();
	}
});
function mount(initialConversion?: ConversionEnvelope, initialText = '[Verse]\nMoon') {
	const host = document.createElement('div');
	document.body.append(host);
	const editor = createLyricEditor(host, {
		initialText: initialConversion?.projectionText ?? initialText,
		initialConversion,
		context: { language: 'en', performers: [], ruleSetVersion: 'test' },
		callbacks: {
			onSnapshot: vi.fn(),
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onAnnouncement: vi.fn()
		}
	});
	editors.push(editor);
	return editor.handle;
}

it('persists the identity high-water mark after undo and never reuses retired IDs after reload', () => {
	const handle = mount();
	handle.switchProfile!('musixmatch');
	expect(
		handle.dispatchConversionAction!(
			{ kind: 'attachAnnotation', range: { from: 0, to: 4 }, annotationId: '123' },
			handle.getSnapshot().revision
		)
	).toEqual({ ok: true });
	const allocated = handle.getSnapshot().conversion!.model;
	const retired = allocated.wrappers[0]!.id;
	handle.undo();
	const saved = handle.getSnapshot().conversion!;
	expect(saved.model.wrappers).toEqual([]);
	expect(saved.model.nextId).toBe(allocated.nextId);
	handle.undo(); // Undo the first profile migration as well.
	const original = handle.getSnapshot().conversion!;
	expect(original.profile).toBe('genius');
	expect(original.model.nextId).toBe(allocated.nextId);
	expect(handle.getSnapshot().text).toBe('[Verse]\nMoon');
	const restored = mount(JSON.parse(JSON.stringify(saved)));
	expect(
		restored.dispatchConversionAction!(
			{ kind: 'attachAnnotation', range: { from: 0, to: 4 }, annotationId: '456' },
			restored.getSnapshot().revision
		)
	).toEqual({ ok: true });
	expect(restored.getSnapshot().conversion!.model.wrappers[0]!.id).not.toBe(retired);
	expect(restored.getSnapshot().conversion!.model.nextId).toBeGreaterThan(allocated.nextId);
	const model = restored.getSnapshot().conversion!.model;
	restored.switchProfile!('genius');
	restored.switchProfile!('musixmatch');
	expect(restored.getSnapshot().conversion!.model).toBe(model);
});

it('undoes and redoes text-identical literal instrumental confirmation as one complete model operation', () => {
	const text = '[Verse]\nOne\n\n#INSTRUMENTAL\n\n[Chorus]\nTwo';
	const handle = mount(undefined, text);
	handle.switchProfile!('musixmatch');
	const sections = handle.getSnapshot().conversion!.model.sections;
	for (const [index, type] of ['Verse', 'Chorus'].entries())
		expect(
			handle.dispatchConversionAction!(
				{
					kind: 'setSectionType',
					sectionId: sections[index]!.id,
					type: type === 'Verse' ? 'Verse' : 'Chorus'
				},
				handle.getSnapshot().revision
			)
		).toEqual({ ok: true });
	const snapshot = handle.getSnapshot();
	const from = snapshot.text.indexOf('#INSTRUMENTAL');
	expect(
		handle.dispatchConversionAction!(
			{
				kind: 'confirmInstrumentalInterval',
				markerRange: { from, to: from + 13 },
				facts: {
					language: 'en',
					recordingId: 'recording:1',
					currentRecordingId: 'recording:1',
					startMs: 1000,
					endMs: 20001,
					recordingDurationMs: 40000,
					lyricalContent: 'none-confirmed',
					placement: 'between-tagged-sections',
					beforeSectionId: sections[0]!.id,
					afterSectionId: sections[1]!.id
				}
			},
			snapshot.revision
		)
	).toEqual({ ok: true });
	expect(handle.getSnapshot().text).toBe(snapshot.text);
	expect(handle.getSnapshot().conversion!.model.markers).toHaveLength(1);
	expect(handle.getSnapshot().conversion!.model.content).not.toContain('#INSTRUMENTAL');
	handle.undo();
	expect(handle.getSnapshot().text).toBe(snapshot.text);
	expect(handle.getSnapshot().conversion!.model.markers).toEqual([]);
	expect(handle.getSnapshot().conversion!.model.content).toContain('#INSTRUMENTAL');
	handle.redo();
	expect(handle.getSnapshot().text).toBe(snapshot.text);
	expect(handle.getSnapshot().conversion!.model.markers).toHaveLength(1);
	handle.switchProfile!('genius');
	expect(handle.getSnapshot().text).toBe('[Verse]\nOne\n\n[Chorus]\nTwo');
	const restored = mount(JSON.parse(JSON.stringify(handle.getSnapshot().conversion)));
	restored.switchProfile!('musixmatch');
	expect(restored.getSnapshot().text).toBe(snapshot.text);
});
