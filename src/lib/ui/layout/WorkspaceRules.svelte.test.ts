import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorPane from '$lib/editor/EditorPane.svelte';
import type { runRules as RunRules } from '$lib/rules/engine.js';
import { createTestWorkbench } from '../test-utils.js';
import MockEditorPane from './MockEditorPane.svelte';
import Workspace from './Workspace.svelte';

type NativeModule = { runRules: typeof RunRules };
const pendingRules = () => Promise.withResolvers<NativeModule>();

async function mount(loadNativeRules: () => Promise<NativeModule>, text = '[Verse]\nOriginal') {
	const workbench = createTestWorkbench({ text });
	workbench.controller.setGrammarCheckEnabled(false);
	const view = await render(Workspace, {
		controller: workbench.controller,
		editorComponent: MockEditorPane,
		harperProvider: { lint: async () => [], dispose: async () => {} },
		loadNativeRules
	});
	await screen.findByRole('tab', { name: /Review/ });
	return { ...workbench, view };
}

async function typeLyrics(text: string) {
	await fireEvent.input(screen.getByRole('textbox', { name: 'Lyrics editor' }), {
		target: { value: text }
	});
}

// Let loader fulfillment and the resulting Svelte updates complete, including
// the negative cases where there should be no lint call to wait for.
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('Workspace native checker startup', () => {
	beforeEach(async () => {
		await page.viewport(1000, 800);
	});
	afterEach(async () => {
		await cleanup();
		vi.restoreAllMocks();
	});

	it('leaves an untouched empty draft ready for input without loading the catalog', async () => {
		const load = vi.fn(() => pendingRules().promise);
		await mount(load, '');
		await screen.findByText('Ready for your lyrics');
		await nextTask();
		expect(load).not.toHaveBeenCalled();
		expect(screen.queryByText('No issues found')).toBeNull();
		expect(screen.queryByText('Checking lyrics…')).toBeNull();
	});

	it('never publishes an unlinked-repeat finding while the real editor restores saved links', async () => {
		const native = await import('$lib/rules/engine.js');
		const text = ['[Chorus]', 'Go', '', '[Verse]', 'Hey', '', '[Chorus 2]', 'Go'].join('\n');
		const { controller } = createTestWorkbench({ text, sectionLinks: [{ lines: [1, 7] }] });
		controller.setGrammarCheckEnabled(false);
		const published = vi.spyOn(controller, 'onSnapshot');
		await render(Workspace, {
			controller,
			editorComponent: EditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} },
			loadNativeRules: async () => native
		});
		await waitFor(() =>
			expect(controller.editor.getSectionLinks?.().map((group) => group.lines)).toEqual([[1, 7]])
		);
		await waitFor(() => expect(controller.snapshot.diagnostics.length).toBeGreaterThan(0));
		expect(published.mock.calls.length).toBeGreaterThan(0);
		expect(
			published.mock.calls
				.flatMap(([snapshot]) => snapshot.diagnostics)
				.filter((diagnostic) => diagnostic.ruleId === 'section.unlinked-repeat')
		).toEqual([]);
	});

	it('keeps pending distinct from clean and checks the latest edit when loading finishes', async () => {
		const pending = pendingRules();
		const load = vi.fn(() => pending.promise);
		const runRules = vi.fn<typeof RunRules>(() => []);
		const { controller, repository } = await mount(load);
		await screen.findByText('Checking lyrics…');
		expect(screen.queryByText('No issues found')).toBeNull();
		await typeLyrics('[Verse]\nLatest');
		expect(controller.snapshot.text).toBe('[Verse]\nLatest');
		await controller.flushAutosave();
		expect((await repository.get(controller.draftId))?.text).toBe('[Verse]\nLatest');
		expect(load).toHaveBeenCalledTimes(1);
		expect(runRules).not.toHaveBeenCalled();
		pending.resolve({ runRules });
		await waitFor(() => expect(runRules).toHaveBeenCalled());
		expect(runRules.mock.calls.every(([document]) => document.text === '[Verse]\nLatest')).toBe(
			true
		);
		await screen.findByText('No issues found');
	});

	it('checks the replacement draft rather than the draft that began loading', async () => {
		const pending = pendingRules();
		const runRules = vi.fn<typeof RunRules>(() => []);
		const { controller } = await mount(() => pending.promise);
		const previousDraft = controller.draftId;
		await fireEvent.click(screen.getByRole('button', { name: "New 'scribe" }));
		await waitFor(() => expect(controller.draftId).not.toBe(previousDraft));
		await typeLyrics('[Verse]\nAnother draft');
		pending.resolve({ runRules });
		await waitFor(() => expect(runRules).toHaveBeenCalled());
		expect(
			runRules.mock.calls.every(([document]) => document.text === '[Verse]\nAnother draft')
		).toBe(true);
	});

	it('waits for a committed snapshot when loading completes during composition', async () => {
		const pending = pendingRules();
		const runRules = vi.fn<typeof RunRules>(() => []);
		const { controller } = await mount(() => pending.promise);
		controller.onSnapshot({ ...controller.snapshot, composing: true });
		pending.resolve({ runRules });
		await nextTask();
		expect(runRules).not.toHaveBeenCalled();
		expect(screen.queryByText('No issues found')).toBeNull();
		expect(screen.getByText('Checking lyrics…')).toBeTruthy();
		const text = '[Verse]\nCommitted';
		await typeLyrics(text);
		await waitFor(() => expect(runRules).toHaveBeenCalled());
		expect(runRules.mock.calls.every(([document]) => document.text === text)).toBe(true);
	});

	it('announces and toasts a load failure, then retries against current lyrics', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const first = pendingRules();
		const retry = pendingRules();
		const load = vi
			.fn<() => Promise<NativeModule>>()
			.mockImplementationOnce(() => first.promise)
			.mockImplementationOnce(() => retry.promise);
		const runRules = vi.fn<typeof RunRules>(() => []);
		const { feedback } = await mount(load);
		first.reject(new Error('Network unavailable'));
		const button = await screen.findByRole('button', { name: 'Retry checking' });
		expect(feedback.announcement).toBe('Lyric checking could not load. Retry in Review.');
		expect(feedback.toasts.some((toast) => toast.message === feedback.announcement)).toBe(true);
		expect(screen.queryByText('No issues found')).toBeNull();
		await typeLyrics('[Verse]\nEdited after failure');
		button.focus();
		await fireEvent.click(button);
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Review/ }))
		);
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		await screen.findByText('Checking lyrics…');
		await typeLyrics('[Verse]\nEdited during retry');
		retry.resolve({ runRules });
		await waitFor(() => expect(runRules).toHaveBeenCalled());
		expect(
			runRules.mock.calls.every(([document]) => document.text === '[Verse]\nEdited during retry')
		).toBe(true);
	});

	it('ignores a loader completing after the workspace is destroyed', async () => {
		const pending = pendingRules();
		const runRules = vi.fn<typeof RunRules>(() => []);
		const { view, controller, feedback } = await mount(() => pending.promise);
		await view.unmount();
		const snapshot = controller.snapshot;
		pending.resolve({ runRules });
		await nextTask();
		expect(runRules).not.toHaveBeenCalled();
		expect(controller.snapshot).toBe(snapshot);
		expect(feedback.toasts).toHaveLength(0);
	});
});
