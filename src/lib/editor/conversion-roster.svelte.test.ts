import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PerformerRecord } from '$lib/core/types.js';
import { createLyricEditor, type LyricEditorInstance } from './create-editor.js';
import { applyPerformerRecordDelta } from './extensions/conversion-roster.js';

const editors: LyricEditorInstance[] = [];
afterEach(() => {
	for (const editor of editors.splice(0)) {
		const host = editor.view.dom.parentElement;
		editor.destroy();
		host?.remove();
	}
});

describe('converted performer history', () => {
	it('publishes matching roster/model snapshots and restores only touched identities on undo and redo', () => {
		const mira: PerformerRecord = {
			id: 'mira',
			displayName: 'Mira',
			normalizedKey: 'mira',
			aliases: [],
			colorId: 'rose',
			order: 0
		};
		const noor: PerformerRecord = {
			id: 'noor',
			displayName: 'Noor',
			normalizedKey: 'noor',
			aliases: [],
			colorId: 'blue',
			order: 1
		};
		let roster = [mira];
		const observed: { name: string; header?: string }[] = [];
		const host = document.createElement('div');
		document.body.append(host);
		const editor = createLyricEditor(host, {
			initialText: '[Verse: Mira]\nMoon',
			context: { language: 'en', performers: roster, ruleSetVersion: 'test' },
			callbacks: {
				onSnapshot: (snapshot) =>
					observed.push({
						name: roster.find((entry) => entry.id === 'mira')!.displayName,
						header: snapshot.conversion?.model.sections[0]?.header
					}),
				onPerformerRecordsChanged: (delta) => {
					roster = applyPerformerRecordDelta(roster, delta);
				},
				onAssignRequest: vi.fn(),
				onSectionHeaderRequest: vi.fn(),
				onDiagnosticActivate: vi.fn(),
				onAnnouncement: vi.fn()
			}
		});
		editors.push(editor);
		editor.handle.switchProfile!('musixmatch');
		const after = { ...mira, displayName: 'Luna', normalizedKey: 'luna' };
		expect(
			editor.handle.dispatchConversionAction!(
				{ kind: 'renamePerformer', performerId: 'mira', previousName: 'Mira', displayName: 'Luna' },
				editor.handle.getSnapshot().revision,
				{ before: [mira], after: [after] }
			)
		).toEqual({ ok: true });
		expect(observed.at(-1)).toEqual({ name: 'Luna', header: '[Verse: Luna]\n' });
		roster = [...roster, noor]; // Independent work must not be replaced by a historical full roster.
		editor.handle.undo();
		expect(observed.at(-1)).toEqual({ name: 'Mira', header: '[Verse: Mira]\n' });
		expect(roster.map((entry) => entry.id)).toEqual(['mira', 'noor']);
		editor.handle.redo();
		expect(observed.at(-1)).toEqual({ name: 'Luna', header: '[Verse: Luna]\n' });
		expect(roster.map((entry) => entry.id)).toEqual(['mira', 'noor']);
		expect(editor.handle.getSnapshot().text).toBe('Moon');
	});
});
