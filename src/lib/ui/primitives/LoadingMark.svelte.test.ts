import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import LoadingMark from './LoadingMark.svelte';

/** The lockup's own single-period wave, as `AppWordmark.svelte` draws it. */
const WAVE_D_ATTRIBUTE_OF_THE_MARK = 'M2 16Q9 6.7 16 16T30 16';

const mark = () => document.querySelector('.app-wordmark') as HTMLElement;
const wave = () => document.querySelector('.app-wordmark__wave path') as SVGPathElement;

const frames = (ms: number) =>
	new Promise<string[]>((done) => {
		const seen: string[] = [];
		const started = performance.now();
		const tick = () => {
			seen.push(wave()?.getAttribute('d') ?? '');
			if (performance.now() - started < ms) requestAnimationFrame(tick);
			else done(seen);
		};
		tick();
	});

describe('LoadingMark', () => {
	/**
	 * The lockup is parked closed, and parked *hard*: `[data-state='static']` in
	 * `shell.css` opens the driver to 1, and `controls.css` is imported before it,
	 * so a rule that merely ties on specificity would lose on order and this would
	 * draw the whole wordmark. Asserted from the computed value rather than from
	 * the selector, because that is the failure — the CSS is valid either way.
	 */
	it('parks the lockup closed on the mark', async () => {
		render(LoadingMark, { props: { label: 'Loading the catalogue' } });

		expect(getComputedStyle(mark()).getPropertyValue('--wm-open')).toBe('0');
		// And it answers nothing: the lockup's own hover and press morph would be a
		// second opinion about where the driver should be.
		expect(getComputedStyle(mark()).pointerEvents).toBe('none');
	});

	// The wave runs, which is the whole of what this element says.
	it('runs the waveform', async () => {
		render(LoadingMark, { props: { label: 'Loading the catalogue' } });

		const drawn = await frames(400);
		expect(new Set(drawn).size).toBeGreaterThan(5);
		expect(drawn.at(-1)).not.toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);
	});

	/**
	 * It borrows the lockup's own path rather than drawing one of its own, so it
	 * has to give it back — a mark left mid-phase would be wrong for every later
	 * use of the same component instance's markup.
	 */
	it('gives the mark its wave back when it goes', async () => {
		const rendered = render(LoadingMark, { props: { label: 'Loading the catalogue' } });
		await frames(120);

		rendered.unmount();
		render(LoadingMark, { props: { label: 'Loading the catalogue' } });
		expect(wave().getAttribute('d')).toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);
	});

	// A wait nothing can see still has to be announced, and it names what is being
	// waited on rather than saying "Loading…" — which is why the label has no
	// default rather than a generic one.
	it('announces what it is waiting for', async () => {
		render(LoadingMark, { props: { label: 'Loading the catalogue' } });

		const status = document.querySelector('[role="status"]') as HTMLElement;
		expect(status.textContent).toBe('Loading the catalogue');
		expect(status.classList.contains('sr-only')).toBe(true);
	});

	it('leaves announcements to a busy containing control when no label is given', async () => {
		render(LoadingMark);

		expect(document.querySelector('[role="status"]')).toBeNull();
		expect(mark().closest('[aria-hidden="true"]')).not.toBeNull();
	});
});
