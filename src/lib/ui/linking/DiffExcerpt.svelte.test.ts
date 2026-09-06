import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import DiffExcerpt from './DiffExcerpt.svelte';

describe('diff lyric locations', () => {
	it('numbers physical excerpt lines for each source and navigates to the lyric offset', async () => {
		const documentText = '[Intro]\nHold tight\nStay here\n[Chorus]\nHold tight\nStay here';
		const onNavigate = vi.fn();
		const { container } = await render(DiffExcerpt, {
			before: '…Hold ',
			leadingEllipsis: true,
			text: 'tight\nStay',
			after: ' here',
			hidden: false,
			documentText,
			sources: [
				{ from: 8, name: 'Intro' },
				{ from: documentText.lastIndexOf('Hold'), name: 'Chorus' }
			],
			onNavigate
		});
		expect(
			[...container.querySelectorAll('.excerpt__numbers')].map((row) =>
				[...row.querySelectorAll('button')].map((button) => button.textContent)
			)
		).toEqual([
			['2', '5'],
			['3', '6']
		]);
		for (const row of container.querySelectorAll('.excerpt__line')) {
			const lyrics = row.querySelector('.lyric-text')!.getBoundingClientRect();
			const numbers = row.querySelector('.excerpt__numbers')!.getBoundingClientRect();
			expect(numbers.left).toBeGreaterThanOrEqual(lyrics.right);
			expect(numbers.right).toBe(row.getBoundingClientRect().right);
		}
		await page.getByRole('button', { name: 'Go to Intro, line 3' }).click();
		expect(onNavigate).toHaveBeenCalledWith(documentText.indexOf('Stay'));
	});
	it('does not give inserted-only preview lines invented document locations or hidden previews controls', async () => {
		const { container } = await render(DiffExcerpt, {
			before: 'Hold ',
			text: 'tight',
			after: '',
			replacement: 'close\nTonight',
			hidden: true,
			documentText: '[Intro]\nHold tight',
			sources: [{ from: 8, name: 'Intro' }],
			onNavigate: vi.fn()
		});
		expect(container.querySelector('button')).toBeNull();
		expect(container.querySelectorAll('.excerpt__numbers')[1]?.textContent?.trim()).toBe('+');
	});
});
