import { fireEvent, screen } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import ClipboardReview from './ClipboardReview.svelte';

afterEach(async () => {
	await cleanup();
	await page.viewport(800, 600);
});

test.each([390, 1200])(
	'presents an exact named format preview and explicit actions at %i pixels',
	async (width) => {
		await page.viewport(width, 844);
		const base = createTestWorkbench().controller;
		const apply = vi.fn();
		const dismiss = vi.fn();
		const preview = '[Verse: ' + 'A long performer name '.repeat(20) + ']\nA [moon](123)';
		const controller = {
			...base,
			snapshot: {
				...base.snapshot,
				clipboardReview: {
					sourceProfile: 'musixmatch' as const,
					from: 0,
					to: 6,
					previewText: preview
				}
			},
			applyClipboardReview: () => {
				apply();
				return true;
			},
			dismissClipboardReview: dismiss
		};
		const view = await render(ClipboardReview, { controller });
		expect(screen.getByLabelText('Genius passage preview').textContent).toBe(preview);
		const applyButton = screen.getByRole('button', { name: 'Apply as Genius' });
		const keepButton = screen.getByRole('button', { name: 'Keep current text' });
		for (const element of [
			applyButton,
			keepButton,
			screen.getByLabelText('Genius passage preview')
		])
			expect(element.getBoundingClientRect().right).toBeLessThanOrEqual(width);
		await fireEvent.click(applyButton);
		expect(apply).toHaveBeenCalledOnce();
		await fireEvent.click(keepButton);
		expect(dismiss).toHaveBeenCalledOnce();
		await view.rerender({ controller: { ...controller, snapshot: base.snapshot } });
		expect(screen.queryByRole('heading', { name: 'Passage format preview' })).toBeNull();
	}
);
