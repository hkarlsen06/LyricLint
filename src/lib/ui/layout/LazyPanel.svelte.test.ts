import { fireEvent, screen } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import LazyPanel from '$lib/interaction/LazyContent.svelte';

afterEach(async () => {
	await cleanup();
});

test('keeps pending text visually hidden by default and shows failures with Retry', async () => {
	const { controller } = createTestWorkbench();
	let rejectLoad!: (error: Error) => void;
	const load = vi.fn(() => import('../tools/SongPanel.svelte'));
	load.mockImplementationOnce(
		() =>
			new Promise((_, reject) => {
				rejectLoad = reject;
			})
	);
	await render(LazyPanel<{ controller: typeof controller }>, {
		name: 'Song',
		load,
		panelProps: { controller }
	});
	expect(screen.getByRole('status').textContent).toBe('Loading Song…');
	expect(screen.getByRole('status').getBoundingClientRect().height).toBeLessThanOrEqual(1);
	rejectLoad(new Error('Offline'));
	const alert = await screen.findByRole('alert');
	expect(alert.textContent).toContain('Could not load Song');
	expect(alert.getBoundingClientRect().height).toBeGreaterThan(1);
	await fireEvent.click(screen.getByRole('button', { name: 'Retry loading Song' }));
	expect(await screen.findByText('Export .txt')).toBeTruthy();
	expect(load).toHaveBeenCalledTimes(2);
	expect(screen.queryByRole('status')).toBeNull();
	expect(screen.queryByRole('alert')).toBeNull();
});

test('a dismissed pending load cannot mount controls when its module arrives later', async () => {
	const { controller } = createTestWorkbench();
	const pending = Promise.withResolvers<typeof import('../tools/SongPanel.svelte')>();
	const view = await render(LazyPanel<{ controller: typeof controller }>, {
		name: 'Song',
		load: () => pending.promise,
		panelProps: { controller }
	});
	await view.unmount();
	pending.resolve(await import('../tools/SongPanel.svelte'));
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	expect(screen.queryByText('Export .txt')).toBeNull();
	expect(screen.queryByRole('status')).toBeNull();
});
