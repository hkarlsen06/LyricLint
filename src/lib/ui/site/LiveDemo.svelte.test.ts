import { screen, waitFor } from '@testing-library/dom';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { createHarperDiagnosticProvider, createWorkerEngine } from '#lib/rules/harper.js';
import { HarperInitializationCanceled } from '#lib/rules/harper-cancellation.js';
import LiveDemo from './LiveDemo.svelte';

const text = '[Verse]\nI has counted every light';

afterEach(async () => {
	await cleanup();
	vi.restoreAllMocks();
});

test('retries actual grammar after a canceled initialization and a fresh lyric edit', async () => {
	const started = Promise.withResolvers<void>();
	const released = Promise.withResolvers<void>();
	let attempts = 0;
	const provider = createHarperDiagnosticProvider((signal) =>
		createWorkerEngine(signal, async (canceled) => {
			if (++attempts === 1) {
				started.resolve();
				await released.promise;
			}
			if (canceled()) return undefined;
			const [{ LocalLinter }, { binary }] = await Promise.all([
				import('harper.js'),
				import('harper.js/binary')
			]);
			const engine = new LocalLinter({ binary });
			return () => engine;
		})
	);
	const lint = vi.spyOn(provider, 'lint');
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	await render(LiveDemo, { text, harperProvider: provider });
	await started.promise;
	window.dispatchEvent(new Event('beforeunload'));
	released.resolve();
	await expect(lint.mock.results[0]?.value).rejects.toBeInstanceOf(HarperInitializationCanceled);
	await page.getByRole('textbox', { name: 'Lyrics editor' }).click();
	await userEvent.keyboard('{End} ');
	await waitFor(() => expect(attempts).toBe(2));
	await screen.findByLabelText(/verb.*number|pronoun.*agree/i, undefined, { timeout: 5000 });
	expect(errors).not.toHaveBeenCalled();
});

test('keeps a live grammar failure distinct from cancellation', async () => {
	const failure = new Error('Worker setup failed');
	const lint = vi.fn(async () => {
		throw failure;
	});
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	await render(LiveDemo, { text, harperProvider: { lint, dispose: async () => {} } });
	await waitFor(() => expect(errors).toHaveBeenCalledWith(expect.any(String), failure));
	await page.getByRole('textbox', { name: 'Lyrics editor' }).click();
	await userEvent.keyboard('{End} ');
	await new Promise((resolve) => setTimeout(resolve, 350));
	expect(lint).toHaveBeenCalledOnce();
});
