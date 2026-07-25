import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
// The lockup's geometry is all `em` and `ch` against `--font-size-lg` in
// `shell.css`, so a width assertion here is only meaningful with the real
// tokens loaded.
import '$lib/ui/styles/global.css';
import AppWordmark from './AppWordmark.svelte';

function lockup(): HTMLElement {
	const element = document.querySelector<HTMLElement>('.app-wordmark');
	expect(element).toBeTruthy();
	return element!;
}

/** The master driver, resolved. Every other value in the lockup is `calc()` of it. */
function open(element: HTMLElement): number {
	return Number.parseFloat(getComputedStyle(element).getPropertyValue('--wm-open'));
}

describe('AppWordmark', () => {
	it('holds the wordmark open for five seconds, then contracts to the mark', async () => {
		vi.useFakeTimers();
		try {
			await render(AppWordmark);
			const element = lockup();

			// Open on mount, which is also what prerendered HTML says: the intro is
			// a hold on the state the page loaded in, not an animation that plays.
			expect(element.dataset.state).toBe('intro');
			expect(open(element)).toBe(1);
			const wordmarkWidth = element.getBoundingClientRect().width;

			await vi.advanceTimersByTimeAsync(4_900);
			expect(element.dataset.state).toBe('intro');

			await vi.advanceTimersByTimeAsync(200);
			expect(element.dataset.state).toBe('idle');

			// The contraction is a CSS transition on the compositor's clock, not on
			// the timer we just wound forward, so the driver is still mid-flight
			// here — real time has to pass before the mark's own width is readable.
			vi.useRealTimers();
			await Promise.all(element.getAnimations().map((animation) => animation.finished));

			expect(open(element)).toBe(0);
			// The mark is a fraction of the wordmark — this is the layout shift the
			// toolbar absorbs, and it is meant to be this big.
			expect(element.getBoundingClientRect().width).toBeLessThan(wordmarkWidth / 3);
		} finally {
			vi.useRealTimers();
		}
	});

	it('stays open and never arms a timer when it is not interactive', async () => {
		vi.useFakeTimers();
		try {
			await render(AppWordmark, { interactive: false });
			const element = lockup();

			expect(element.dataset.state).toBe('static');
			await vi.advanceTimersByTimeAsync(10_000);
			expect(element.dataset.state).toBe('static');
			expect(open(element)).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('suppresses the whole rig, not just its speed, under reduced motion', async () => {
		// Suppressed rather than shortened: the lockup reports nothing, so a faster
		// version of it would be motion with nothing to say. It parks open, which
		// is the state that carries the most brand for the least movement.
		const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
			(query: string) =>
				({
					matches: query.includes('prefers-reduced-motion: reduce'),
					media: query,
					addEventListener: () => {},
					removeEventListener: () => {}
				}) as unknown as MediaQueryList
		);
		vi.useFakeTimers();
		try {
			await render(AppWordmark);
			const element = lockup();

			expect(element.dataset.state).toBe('static');
			await vi.advanceTimersByTimeAsync(10_000);
			expect(element.dataset.state).toBe('static');
		} finally {
			vi.useRealTimers();
			matchMedia.mockRestore();
		}
	});

	it('transitions the driver and nothing else', async () => {
		// The invariant the whole component rests on: widths, tints, the flatten,
		// and every per-letter offset are `calc()` off `--wm-open`, so they cannot
		// race or land in different places when a hover interrupts the intro. A
		// second transition here would mean something had been given its own clock.
		await render(AppWordmark);
		const element = lockup();

		expect(getComputedStyle(element).transitionProperty).toBe('--wm-open');
		const owned = [...element.querySelectorAll<HTMLElement>('*')].filter(
			(node) => getComputedStyle(node).transitionProperty !== 'all'
		);
		expect(owned).toEqual([]);
	});

	it('names the product once and keeps the letters out of the accessibility tree', async () => {
		const screen = await render(AppWordmark);

		await expect.element(screen.getByRole('img', { name: 'LyricLint' })).toBeInTheDocument();
		// Nine spans and two brackets, none of them announced.
		const element = lockup();
		for (const child of element.children) {
			expect(child.getAttribute('aria-hidden')).toBe('true');
		}
		expect(element.textContent?.replace(/\s+/g, '')).toBe('LyricLint');
	});
});
