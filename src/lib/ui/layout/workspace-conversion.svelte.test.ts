import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import EditorPane from '$lib/editor/EditorPane.svelte';
import { setComposingEffect } from '$lib/editor/extensions/editor-state.js';
import { importDocument } from '$lib/conversion/import.js';
import { createConversionEnvelope } from '$lib/persistence/conversion.js';
import { profilePolicyVersions } from '$lib/profiles/versions.js';
import { createTestWorkbench } from '../test-utils.js';
import { createFeedbackState } from '../state/feedback.svelte.js';
import { createInMemoryMediaRepository } from '../state/in-memory.js';
import { createMediaPlayer, type MediaPlayer } from '../state/media-player.svelte.js';
import { StubAudio } from '../state/media-test-audio.js';
import Workspace from './Workspace.svelte';

const players: MediaPlayer[] = [];
afterEach(async () => {
	await cleanup();
	for (const player of players.splice(0)) player.destroy();
	vi.restoreAllMocks();
});

async function setup(text = '[Verse]\nOne\nTwo') {
	await page.viewport(1200, 800);
	const audio = new StubAudio();
	const player = createMediaPlayer({
		feedback: createFeedbackState(),
		createAudio: () => audio.asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {}
	});
	players.push(player);
	const { controller, feedback } = createTestWorkbench({
		text,
		selection: { anchor: 0, head: 0 },
		media: { repository: createInMemoryMediaRepository(), player }
	});
	controller.setGrammarCheckEnabled(false);
	await waitFor(() => expect(controller.media?.restoring).toBe(false));
	await controller.media!.attachFile(new File(['audio'], 'first.mp3', { type: 'audio/mpeg' }));
	audio.setDuration(100);
	const imported = importDocument({ text, profile: 'genius', language: 'en' });
	if (!imported.ok) throw new Error(imported.refusal.message);
	imported.value.recordingId = 'file:previous';
	controller.onSnapshot({
		...controller.snapshot,
		conversion: createConversionEnvelope(imported.value, 'genius', profilePolicyVersions)
	});
	return { controller, feedback, player, audio };
}

async function mount(controller: ReturnType<typeof createTestWorkbench>['controller']) {
	const placeholder = controller.editor;
	const view = await render(Workspace, {
		controller,
		editorComponent: EditorPane,
		harperProvider: { lint: async () => [], dispose: async () => {} }
	});
	await waitFor(() => expect(controller.editor).not.toBe(placeholder));
	await screen.findByRole('textbox', { name: 'Lyrics editor' });
	const cm = EditorView.findFromDOM(view.container.querySelector('.cm-editor')!);
	if (!cm) throw new Error('The real editor did not mount');
	return { ...view, cm };
}

test('waits for the mounted editor and applies a recording identity once, then defers changes during IME', async () => {
	const { controller, feedback } = await setup();
	const placeholder = controller.editor;
	const apply = vi.spyOn(controller, 'applyConversionAction');
	const { cm } = await mount(controller);
	await waitFor(() =>
		expect(controller.snapshot.conversion?.model.recordingId).toBe(controller.media?.recordingId)
	);
	expect(apply).toHaveBeenCalledTimes(1);
	expect(controller.editor).not.toBe(placeholder);
	expect(feedback.toasts).toEqual([]);
	const first = controller.media!.recordingId;
	cm.dispatch({ effects: setComposingEffect.of(true) });
	expect(controller.snapshot.composing).toBe(false); // The bridge withholds preedit snapshots.
	await controller.media!.attachFile(new File(['different'], 'second.mp3', { type: 'audio/mpeg' }));
	await new Promise((resolve) => requestAnimationFrame(resolve));
	expect(controller.snapshot.conversion?.model.recordingId).toBe(first);
	expect(apply).toHaveBeenCalledTimes(1);
	expect(feedback.toasts).toEqual([]);
	cm.dispatch({ effects: setComposingEffect.of(false) });
	await waitFor(() =>
		expect(controller.snapshot.conversion?.model.recordingId).toBe(controller.media?.recordingId)
	);
	expect(apply).toHaveBeenCalledTimes(2);
	controller.editor.setSelection({ anchor: 1, head: 1 });
	await new Promise((resolve) => requestAnimationFrame(resolve));
	expect(apply).toHaveBeenCalledTimes(2);
});

test.each(['[Verse]\nOne\nTwo', 'One\nTwo'])(
	'switching profile ends a sync run without changing playback: %s',
	async (text) => {
		const { controller, feedback, player, audio } = await setup(text);
		await mount(controller);
		await waitFor(() =>
			expect(controller.snapshot.conversion?.model.recordingId).toBe(controller.media?.recordingId)
		);
		await fireEvent.click(await screen.findByRole('button', { name: 'Sync lyrics' }));
		expect(controller.editor.isLyricSyncActive?.()).toBe(true);
		expect(player.playing).toBe(true);
		audio.currentTime = 23;
		const pause = vi.spyOn(player, 'pause');
		const seek = vi.spyOn(player, 'seek');
		controller.switchProfile('musixmatch');
		await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop syncing' })).toBeNull());
		expect(controller.editor.isLyricSyncActive?.()).toBe(false);
		expect(player.playing).toBe(true);
		expect(audio.currentTime).toBe(23);
		expect(pause).not.toHaveBeenCalled();
		expect(seek).not.toHaveBeenCalled();
		expect(feedback.announcement).toBe('Musixmatch format. Sync ended.');
	}
);

test('does not retry a refused recording update on every selection snapshot', async () => {
	const { controller } = await setup();
	const apply = vi.spyOn(controller, 'applyConversionAction').mockReturnValue(false);
	await mount(controller);
	await waitFor(() => expect(apply).toHaveBeenCalledOnce());
	controller.editor.setSelection({ anchor: 1, head: 1 });
	await new Promise((resolve) => requestAnimationFrame(resolve));
	controller.editor.setSelection({ anchor: 2, head: 2 });
	await new Promise((resolve) => requestAnimationFrame(resolve));
	expect(apply).toHaveBeenCalledOnce();
	await controller.media!.attachFile(new File(['new'], 'replacement.mp3', { type: 'audio/mpeg' }));
	await waitFor(() => expect(apply).toHaveBeenCalledTimes(2));
});

test('recording-only metadata changes keep sync active when lyrics and profile are unchanged', async () => {
	const { controller, player } = await setup();
	await mount(controller);
	await waitFor(() =>
		expect(controller.snapshot.conversion?.model.recordingId).toBe(controller.media?.recordingId)
	);
	controller.editor.setLyricSync?.(true);
	expect(controller.editor.isLyricSyncActive?.()).toBe(true);
	const pause = vi.spyOn(player, 'pause');
	expect(
		controller.editor.dispatchConversionAction?.(
			{ kind: 'setRecording', recordingId: 'file:updated' },
			controller.snapshot.revision
		)
	).toEqual({ ok: true });
	expect(controller.editor.isLyricSyncActive?.()).toBe(true);
	expect(pause).not.toHaveBeenCalled();
});

test('a Musixmatch linking request opens retained section links from the visible lyrics', async () => {
	const { controller } = await setup();
	await mount(controller);
	controller.switchProfile('musixmatch');
	controller.setActiveTab('song');
	controller.editor.setSelection({ anchor: 0, head: 3 });
	controller.editor.requestSectionLink?.();
	await waitFor(() => expect(controller.activeTab).toBe('linking'));
	expect(controller.snapshot.text).toBe('One\nTwo');
});
