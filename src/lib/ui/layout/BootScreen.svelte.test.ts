import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { waitFor } from '@testing-library/dom';
import BootScreen from './BootScreen.svelte';

const screen = () => document.querySelector('.boot-screen') as HTMLElement;
const WAVE_D_ATTRIBUTE_OF_THE_MARK = 'M2 16Q9 6.7 16 16T30 16';
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('BootScreen', () => {
	it('pulls the word into the waiting mark and stops its waveform when removed', async () => {
		const ondone = vi.fn();
		const view = await render(BootScreen, { ondone });
		const mark = screen().querySelector('.app-wordmark') as HTMLElement;
		const wave = screen().querySelector('.app-wordmark__wave') as SVGSVGElement;
		const path = wave.querySelector('path')!;
		expect(screen().dataset.stage).toBe('pull');
		expect(screen().getAttribute('aria-hidden')).toBe('true');
		expect(screen().querySelector('[role="status"]')).toBeNull();
		expect(Number(getComputedStyle(mark).getPropertyValue('--wm-open'))).toBeGreaterThanOrEqual(1);
		expect(getComputedStyle(wave).visibility).toBe('hidden');

		const frames: { stage: string | undefined; open: number; waiting: boolean }[] = [];
		const started = performance.now();
		while (performance.now() - started < 1200) {
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
		expect(ondone).not.toHaveBeenCalled();

		await view.rerender({ ready: true });
		expect(screen().hasAttribute('data-leaving')).toBe(true);
		expect(path.getAttribute('d')).toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);
		await waitFor(() => expect(ondone).toHaveBeenCalledTimes(1));
		expect(Number(getComputedStyle(screen()).getPropertyValue('--boot-shock'))).toBe(1);

		await view.unmount();
		expect(document.querySelector('.boot-screen')).toBeNull();
		expect(path.getAttribute('d')).toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);
		await nextFrame();
		expect(path.getAttribute('d')).toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);
	});

	it('parks on a static mark under reduced motion', async () => {
		const real = window.matchMedia;
		const media = vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
			...real.call(window, query),
			matches: query.includes('prefers-reduced-motion')
		}));
		try {
			const ondone = vi.fn();
			const view = await render(BootScreen, { ondone });
			expect(screen().dataset.stage).toBe('land');
			expect(screen().hasAttribute('data-wait')).toBe(true);
			const path = screen().querySelector('.app-wordmark__wave path') as SVGPathElement;
			for (let frame = 0; frame < 5; frame++) {
				await nextFrame();
				expect(path.getAttribute('d')).toBe(WAVE_D_ATTRIBUTE_OF_THE_MARK);
			}
			await view.rerender({ ready: true });
			await waitFor(() => expect(ondone).toHaveBeenCalledTimes(1), { timeout: 200 });
		} finally {
			media.mockRestore();
		}
	});

	it('can be removed during the pull without leaving timers', async () => {
		const clear = vi.spyOn(window, 'clearTimeout');
		try {
			const view = await render(BootScreen);
			expect(screen().dataset.stage).toBe('pull');
			const before = clear.mock.calls.length;
			await view.unmount();
			expect(clear.mock.calls.length - before).toBeGreaterThanOrEqual(1);
			expect(document.querySelector('.boot-screen')).toBeNull();
		} finally {
			clear.mockRestore();
		}
	});
});
