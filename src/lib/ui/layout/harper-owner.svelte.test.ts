import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { createHarperDiagnosticProvider, createWorkerEngine } from '#lib/rules/harper.js';
import { createTestWorkbench } from '../test-utils.js';
import Workspace from './Workspace.svelte';
import MockEditorPane from './MockEditorPane.svelte';

const text = '[Verse]\nI has counted every streetlight';
afterEach(async () => {
	await cleanup();
});

for (const boundary of [
	'outer import',
	'inner initialization',
	'input before initialization settles'
] as const) {
	test(`resumes unchanged grammar after canceled navigation at ${boundary}`, async () => {
		const ready = Promise.withResolvers<void>();
		const started = Promise.withResolvers<void>();
		const construct = vi.fn(async () => {
			const [{ LocalLinter }, { binary }] = await Promise.all([
				import('harper.js'),
				import('harper.js/binary')
			]);
			return new LocalLinter({ binary });
		});
		const factory: typeof createHarperDiagnosticProvider = (_create, ownerSignal) =>
			createHarperDiagnosticProvider(
				async (signal) =>
					createWorkerEngine(signal, async (canceled) => {
						if (boundary !== 'outer import') {
							started.resolve();
							await ready.promise;
						}
						if (canceled()) return undefined;
						const engine = await construct();
						return () => engine;
					}),
				ownerSignal
			);
		const loadHarper = vi.fn(async () => {
			if (boundary === 'outer import') {
				started.resolve();
				await ready.promise;
			}
			return { createHarperDiagnosticProvider: factory };
		});
		const { controller } = createTestWorkbench({ text });
		controller.setLanguage('en');
		await render(Workspace, { controller, editorComponent: MockEditorPane, loadHarper });
		await started.promise;
		window.dispatchEvent(new Event('beforeunload'));
		if (boundary !== 'input before initialization settles') ready.resolve();
		await new Promise((resolve) => setTimeout(resolve, 400));
		// Completing the old import is not permission to start new resources.
		expect(construct).not.toHaveBeenCalled();
		expect(screen.queryByText('No issues found')).toBeNull();
		expect(controller.snapshot.diagnostics.some((d) => d.ruleId === 'grammar.harper')).toBe(false);
		const editor = await screen.findByRole('textbox', { name: 'Lyrics editor' });
		await fireEvent.pointerDown(editor);
		await fireEvent.select(editor);
		if (boundary === 'input before initialization settles') {
			await new Promise((resolve) => setTimeout(resolve, 350));
			ready.resolve();
		}
		await waitFor(
			() =>
				expect(controller.snapshot.diagnostics.some((d) => d.ruleId === 'grammar.harper')).toBe(
					true
				),
			{ timeout: 5000 }
		);
		expect(controller.snapshot.text).toBe(text);
		expect(screen.queryByText(/grammar checking is unavailable/i)).toBeNull();
	});
}

test('runs real browser worker grammar in the workbench', async () => {
	const { controller } = createTestWorkbench({ text });
	controller.setLanguage('en');
	await render(Workspace, { controller, editorComponent: MockEditorPane });
	await waitFor(
		() =>
			expect(controller.snapshot.diagnostics.some((d) => d.ruleId === 'grammar.harper')).toBe(true),
		{ timeout: 20000 }
	);
	expect(screen.getByText(/verb.*number|pronoun.*agree/i)).toBeTruthy();
});

test('retains true empty coverage and the ready engine across a canceled departure', async () => {
	const { controller } = createTestWorkbench({ text: '[Verse]\nI have counted every streetlight' });
	controller.setLanguage('en');
	const provider = createHarperDiagnosticProvider();
	const lint = vi.spyOn(provider, 'lint');
	const view = await render(Workspace, {
		controller,
		editorComponent: MockEditorPane,
		harperProvider: provider
	});
	await waitFor(() => expect(screen.getByText('No issues found')).toBeTruthy(), { timeout: 15000 });
	expect(await lint.mock.results[0]?.value).toEqual([]);
	window.dispatchEvent(new Event('beforeunload'));
	await fireEvent.keyDown(window, { key: 'Shift' });
	await new Promise((resolve) => setTimeout(resolve, 350));
	expect(lint).toHaveBeenCalledOnce();
	await view.unmount();
});
