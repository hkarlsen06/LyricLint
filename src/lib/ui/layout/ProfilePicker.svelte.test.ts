import { screen, waitFor } from '@testing-library/dom';
import { cdp, page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import DocumentToolbar from './DocumentToolbar.svelte';

afterEach(async () => {
	await cleanup();
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
	await page.viewport(800, 600);
});

test.each([1280, 360, 390])(
	'fixed primary and independent editable export at %ipx',
	async (width) => {
		await cdp().send('Emulation.setTouchEmulationEnabled', {
			enabled: width < 600,
			maxTouchPoints: 1
		});
		await page.viewport(width, 700);
		const { controller } = createTestWorkbench({ text: 'A [silver compass](123456) (nearby)' });
		const original = controller.snapshot;
		await render(DocumentToolbar, { controller });
		expect(screen.queryByRole('button', { name: 'Lyric format: Musixmatch' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Copy Genius' })).toBeVisible();
		const opener = screen.getByRole('button', { name: 'Export to Musixmatch' });
		await userEvent.click(opener);
		const output = screen.getByRole('textbox', { name: 'Musixmatch output' });
		await userEvent.fill(output, 'Independent output\n');
		expect(controller.snapshot).toBe(original);
		await userEvent.keyboard('{Escape}');
		await waitFor(() => expect(document.querySelector('dialog:modal')).toBeNull());
		expect(document.activeElement).toBe(opener);
		await userEvent.click(opener);
		expect(screen.getByRole('textbox', { name: 'Musixmatch output' })).toHaveValue(
			'Independent output\n'
		);
		const reopened = screen.getByRole('textbox', { name: 'Musixmatch output' });
		const box = reopened.getBoundingClientRect();
		expect(box.left).toBeGreaterThanOrEqual(0);
		expect(box.right).toBeLessThanOrEqual(width);
		expect(parseFloat(getComputedStyle(reopened).fontSize)).toBeGreaterThanOrEqual(16);
		await userEvent.click(screen.getByRole('button', { name: 'Edit lyrics' }));
		expect(controller.snapshot).toBe(original);
	}
);
