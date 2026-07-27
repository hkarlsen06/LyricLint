import { describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
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

/** A press, plus the flush that lands its state change on the attribute. */
async function press(element: HTMLElement): Promise<void> {
	element.click();
	await tick();
}

/** The master driver, resolved. Every other value in the lockup is `calc()` of it. */
function open(element: HTMLElement): number {
	return Number.parseFloat(getComputedStyle(element).getPropertyValue('--wm-open'));
}

describe('AppWordmark', () => {
	it('holds the wordmark open long enough to read, then contracts to the mark', async () => {
		vi.useFakeTimers();
		try {
			await render(AppWordmark);
			const element = lockup();

			// Open on mount, which is also what prerendered HTML says: the intro is
			// a hold on the state the page loaded in, not an animation that plays.
			expect(element.dataset.state).toBe('intro');
			expect(open(element)).toBe(1);
			const wordmarkWidth = element.getBoundingClientRect().width;

			// The hold is one word's reading time, so the bound that matters is that
			// it survives a fixation rather than that it lasts any particular round
			// number: a lockup that contracted inside 400ms would be gone before it
			// had been read, which is the whole point of holding at all.
			await vi.advanceTimersByTimeAsync(6_999);
			expect(element.dataset.state).toBe('intro');

			await vi.advanceTimersByTimeAsync(1);
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

	it('runs the intro backwards where the brand is the reason for the page', async () => {
		vi.useFakeTimers();
		try {
			await render(AppWordmark, { entrance: 'reveal' });
			const element = lockup();

			// Closed on mount, and closed in the prerendered HTML with it: the mark is
			// what the landing page loads as, and the word grows out of it. The beat
			// before it does is shorter than the workbench's hold, because a glyph
			// costs a fixation to register and none of the reading a word does.
			expect(element.dataset.state).toBe('idle');
			expect(open(element)).toBe(0);
			const markWidth = element.getBoundingClientRect().width;

			await vi.advanceTimersByTimeAsync(1_000);
			expect(element.dataset.state).toBe('intro');

			vi.useRealTimers();
			await Promise.all(element.getAnimations().map((animation) => animation.finished));

			expect(open(element)).toBe(1);
			expect(element.getBoundingClientRect().width).toBeGreaterThan(markWidth * 3);
		} finally {
			vi.useRealTimers();
		}
	});

	it('hands the boot wordmark into the header from the left', async () => {
		await render(AppWordmark, { entrance: 'handoff' });
		const element = lockup();

		expect(element.dataset.state).toBe('intro');
		expect(getComputedStyle(element).animationName).toBe('wordmark-handoff-left');
		expect(getComputedStyle(element.querySelector('.app-wordmark__lead')!).animationName).toBe(
			'none'
		);
		expect(
			(element.getAnimations()[0]?.effect as KeyframeEffect | null)?.getKeyframes().at(-1)?.clipPath
		).toBe('inset(0px)');
	});

	it('reserves the handoff space until the wordmark arrives', async () => {
		const view = await render(AppWordmark, { entrance: 'handoff', visible: false });
		const element = lockup();
		const width = element.getBoundingClientRect().width;

		expect(getComputedStyle(element).visibility).toBe('hidden');
		expect(open(element)).toBe(1);
		expect(width).toBeGreaterThan(0);

		await view.rerender({ entrance: 'handoff', visible: true });
		expect(lockup()).toBe(element);
		expect(getComputedStyle(element).visibility).toBe('visible');
		expect(getComputedStyle(element).animationDelay).toBe('0.36s');
	});

	it('leaves a revealed lockup open instead of contracting after it', async () => {
		// The two modes are not the same animation played in two directions: the
		// workbench's contracts because a masthead over a tool has to yield the
		// space back, and the landing page's does not, because there is nothing
		// underneath it waiting for that space. A reveal that then folded away
		// would spend the page's one branding moment on a round trip.
		vi.useFakeTimers();
		try {
			await render(AppWordmark, { entrance: 'reveal' });
			const element = lockup();

			await vi.advanceTimersByTimeAsync(30_000);
			expect(element.dataset.state).toBe('intro');

			// Same clock caveat as the hold's test: the driver moves on the
			// compositor's, not on the one just wound forward.
			vi.useRealTimers();
			await Promise.all(element.getAnimations().map((animation) => animation.finished));
			expect(open(element)).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('renders the plain wordmark without any animation when animation is disabled', async () => {
		vi.useFakeTimers();
		try {
			await render(AppWordmark, { animated: false });
			const element = lockup();

			expect(element.dataset.state).toBe('static');
			expect(open(element)).toBe(1);
			expect(getComputedStyle(element).transitionProperty).toBe('none');

			await vi.advanceTimersByTimeAsync(30_000);
			await press(element);
			expect(element.dataset.state).toBe('static');
			expect(open(element)).toBe(1);
			expect(element.getAnimations()).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('toggles on every press, including the first one during the intro', async () => {
		// The press inverts what is on screen, not the latch, so the first press
		// while the intro still holds closes the wordmark instead of appearing to
		// do nothing. After that it alternates.
		await render(AppWordmark);
		const element = lockup();
		expect(element.dataset.state).toBe('intro');

		await press(element);
		expect(element.dataset.state).toBe('released');

		await press(element);
		expect(element.dataset.state).toBe('latched');

		await press(element);
		expect(element.dataset.state).toBe('released');
	});

	it('outranks hover in both directions once pressed', async () => {
		// `released` is the state that has to survive a pointer still sitting on
		// the lockup, because on touch it always is: a tap leaves `:hover` stuck to
		// whatever was tapped until something else is. If hover could still open a
		// released lockup, the second tap could never close it.
		await render(AppWordmark);
		const element = lockup();
		await press(element);

		expect(element.dataset.state).toBe('released');
		// `released` is absent from the open-state selector list in `shell.css`,
		// and `:hover` only ever appears there alongside `idle` — so a pointer
		// resting on a released lockup cannot reopen it.
		expect(open(element)).toBe(0);
	});

	it('releases the latch for a mouse leaving and not for a finger lifting', async () => {
		// A touch pointer is destroyed when the finger lifts, so `pointerleave`
		// fires immediately after every tap. Releasing on it would undo each press
		// on the frame it happened, and the toggle would never appear to work.
		await render(AppWordmark);
		const element = lockup();
		await press(element);
		await press(element);
		expect(element.dataset.state).toBe('latched');

		element.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'touch' }));
		await tick();
		expect(element.dataset.state).toBe('latched');

		element.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		await tick();
		// Releasing restores whatever the lockup would have been doing unpressed,
		// rather than picking a state of its own — which this early is still the
		// intro hold, since these presses all happened inside the first 7,000ms.
		expect(element.dataset.state).toBe('intro');
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
