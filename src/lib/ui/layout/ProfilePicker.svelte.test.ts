import { screen, waitFor } from '@testing-library/dom';
import { cdp, page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import DocumentToolbar from './DocumentToolbar.svelte';

afterEach(async () => {
	await cleanup();
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
	await page.viewport(800, 600);
});

test.each([1440, 320, 360, 390])(
	'keeps the committed choice marked and keyboard cancellation stable at %ipx',
	async (width) => {
		await cdp().send('Emulation.setTouchEmulationEnabled', {
			enabled: width < 600,
			maxTouchPoints: 1
		});
		await page.viewport(width, 900);
		const { controller } = createTestWorkbench();
		const switchProfile = vi.fn<NonNullable<typeof controller.editor.switchProfile>>(() => ({
			ok: false,
			deferred: true,
			message: 'Waiting for composition.'
		}));
		controller.editor.switchProfile = switchProfile;
		await render(DocumentToolbar, { controller });
		await document.fonts.ready;
		const genius = screen.getByRole('button', { name: 'Lyric format: Genius' });
		const musixmatch = screen.getByRole('button', { name: 'Lyric format: Musixmatch' });
		const copy = screen.getByRole('button', { name: 'Copy lyrics' });
		const bounds = [genius, musixmatch, copy].map((el) => el.getBoundingClientRect().toJSON());
		await userEvent.click(genius);
		expect(switchProfile).not.toHaveBeenCalled();
		await userEvent.click(musixmatch);
		expect(controller.pendingProfile).toBe('musixmatch');
		expect(genius.getAttribute('aria-pressed')).toBe('true');
		expect(musixmatch.getAttribute('aria-pressed')).toBe('false');
		expect(genius.title).toBe('Cancel pending format switch');
		expect(genius.textContent).toContain('Genius');
		expect(musixmatch.textContent).toContain('Musixmatch');
		expect(document.activeElement).toBe(musixmatch);
		expect([genius, musixmatch, copy].map((el) => el.getBoundingClientRect().toJSON())).toEqual(
			bounds
		);
		genius.focus();
		await userEvent.keyboard('{Enter}');
		await waitFor(() => expect(controller.pendingProfile).toBeUndefined());
		expect(document.activeElement).toBe(genius);
		await userEvent.click(musixmatch);
		genius.focus();
		await userEvent.keyboard(' ');
		await waitFor(() => expect(controller.pendingProfile).toBeUndefined());
		expect(document.activeElement).toBe(genius);
		expect([genius, musixmatch, copy].map((el) => el.getBoundingClientRect().toJSON())).toEqual(
			bounds
		);
	}
);
