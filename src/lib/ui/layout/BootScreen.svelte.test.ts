import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import BootScreen from './BootScreen.svelte';

async function withoutMotion(run: () => Promise<void>): Promise<void> {
	const real = window.matchMedia;
	window.matchMedia = ((query: string) => ({
		...real.call(window, query),
		matches: query.includes('prefers-reduced-motion')
	})) as typeof window.matchMedia;
	try {
		await run();
	} finally {
		window.matchMedia = real;
	}
}

const screen = () => document.querySelector('.boot-screen') as HTMLElement;
const WAVE_D_ATTRIBUTE_OF_THE_MARK = 'M2 16Q9 6.7 16 16T30 16';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('BootScreen', () => {
	it('pulls the word into a steady mark and runs the wave while startup remains pending', async () => {
		await render(BootScreen);
		const mark = screen().querySelector('.app-wordmark') as HTMLElement;
		const wave = screen().querySelector('.app-wordmark__wave') as SVGSVGElement;
		const path = wave.querySelector('path')!;
		expect(screen().dataset.stage).toBe('word');
		expect(getComputedStyle(mark).getPropertyValue('--wm-open')).toBe('1');
		expect(getComputedStyle(wave).visibility).toBe('hidden');

		const frames: { stage: string | undefined; open: number; waiting: boolean }[] = [];
		const started = performance.now();
		while (performance.now() - started < 1900) {
			frames.push({
				stage: screen().dataset.stage,
				open: Number(getComputedStyle(mark).getPropertyValue('--wm-open')),
				waiting: screen().hasAttribute('data-wait')
			});
			await nextFrame();
		}
		expect(frames.some((frame) => frame.stage === 'pull' && frame.open > 1)).toBe(true);
		expect(frames.filter((frame) => frame.stage !== 'land').some((frame) => frame.waiting)).toBe(
			false
		);
		const fall = frames.filter((frame) => frame.stage === 'land');
		expect(Math.max(...fall.map((frame) => frame.open))).toBeGreaterThan(0.5);
		expect(Math.min(...fall.map((frame) => frame.open))).toBeGreaterThanOrEqual(-0.001);
		expect(fall.at(-1)?.open).toBeCloseTo(0, 3);
		expect(screen().hasAttribute('data-wait')).toBe(true);
		expect(getComputedStyle(wave).visibility).toBe('visible');
		expect(path.getAttribute('d')).not.toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);
		// Pending work keeps an opaque canvas; there is no timed reveal state.
		expect(screen().hasAttribute('data-leaving')).toBe(false);
		expect(getComputedStyle(screen(), '::before').content).toBe('none');
		expect(getComputedStyle(screen()).maskImage).toBe('none');
	});

	it('announces the pending workspace after its live region mounts', async () => {
		await render(BootScreen);
		const status = screen().querySelector('[role="status"]')!;
		await vi.waitFor(() => expect(status.textContent).toBe('Loading your workspace…'));
	});

	it('parks on the mark under reduced motion and stops its wave when removed', async () => {
		await withoutMotion(async () => {
			const view = await render(BootScreen);
			expect(screen().dataset.stage).toBe('land');
			expect(screen().hasAttribute('data-wait')).toBe(true);
			const path = screen().querySelector('.app-wordmark__wave path') as SVGPathElement;
			const shapes = new Set<string | null>();
			for (let frame = 0; frame < 5; frame++) {
				await nextFrame();
				shapes.add(path.getAttribute('d'));
				expect(path.getBBox().x).toBeCloseTo(2, 5);
				expect(path.getBBox().width).toBeCloseTo(28, 5);
			}
			expect(shapes.size).toBeGreaterThan(1);
			await view.unmount();
			expect(document.querySelector('.boot-screen')).toBeNull();
			expect(path.getAttribute('d')).toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);
			await nextFrame();
			expect(path.getAttribute('d')).toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);
		});
	});

	it('can be removed before the first animation stage without leaving timers', async () => {
		const clear = vi.spyOn(window, 'clearTimeout');
		try {
			const view = await render(BootScreen);
			const root = screen();
			expect(root.dataset.stage).toBe('word');
			const before = clear.mock.calls.length;
			await view.unmount();
			expect(clear.mock.calls.length - before).toBeGreaterThanOrEqual(4);
			expect(document.querySelector('.boot-screen')).toBeNull();
		} finally {
			clear.mockRestore();
		}
	});
});
