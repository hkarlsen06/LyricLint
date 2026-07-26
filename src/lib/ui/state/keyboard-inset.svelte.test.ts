import { afterEach, describe, expect, it } from 'vitest';
import { trackKeyboardInset } from './keyboard-inset.js';

/**
 * A stand-in for `window.visualViewport`. The real one cannot be driven from a
 * test — there is no software keyboard in a headless browser — and what is under
 * test is what the tracker publishes for a given visible viewport, not the
 * browser's reporting of it.
 */
function stubViewport(height: number, width = 400) {
	const listeners = new Set<() => void>();
	const viewport = {
		height,
		width,
		offsetTop: 0,
		addEventListener: (_: string, listener: () => void) => listeners.add(listener),
		removeEventListener: (_: string, listener: () => void) => listeners.delete(listener)
	};
	Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
	return {
		/** Move the visible viewport and let the tracker settle on the next frame. */
		async set(next: Partial<{ height: number; width: number; offsetTop: number }>) {
			Object.assign(viewport, next);
			for (const listener of listeners) listener();
			await new Promise((resolve) => requestAnimationFrame(resolve));
			await new Promise((resolve) => requestAnimationFrame(resolve));
		},
		get listenerCount() {
			return listeners.size;
		}
	};
}

const root = document.documentElement;
const keyboardTop = () => root.style.getPropertyValue('--keyboard-top');

describe('trackKeyboardInset', () => {
	afterEach(() => {
		Reflect.deleteProperty(window, 'visualViewport');
		root.style.removeProperty('--keyboard-top');
		delete root.dataset.keyboardInset;
	});

	it('publishes nothing while the visible viewport is the tallest it has been', () => {
		stubViewport(800);
		const stop = trackKeyboardInset();

		expect(keyboardTop()).toBe('');
		expect(root.dataset.keyboardInset).toBeUndefined();
		stop();
	});

	/**
	 * The gate is the *drop* in visible height, never a comparison against
	 * `window.innerHeight`. What the layout viewport does when a keyboard opens
	 * differs by engine and by version, and the first version of this shipped on
	 * that assumption and did nothing at all on a real phone. A shrinking visual
	 * viewport is the one thing that is true everywhere.
	 */
	it('publishes the visible bottom edge once the viewport drops, and clears it again', async () => {
		const viewport = stubViewport(800);
		const stop = trackKeyboardInset();

		await viewport.set({ height: 480 });
		expect(keyboardTop()).toBe('480px');
		expect(root.dataset.keyboardInset).toBe('');

		await viewport.set({ height: 800 });
		expect(keyboardTop()).toBe('');
		expect(root.dataset.keyboardInset).toBeUndefined();
		stop();
	});

	/**
	 * iOS pushes the visible viewport down inside the layout one to bring the caret
	 * into view, and `position: fixed` is measured from the layout viewport's top.
	 * Dropping the offset puts the strip over the top row of keys by exactly it.
	 */
	it('counts the offset the browser pushed the visible viewport down by', async () => {
		const viewport = stubViewport(800);
		const stop = trackKeyboardInset();

		await viewport.set({ height: 480, offsetTop: 40 });

		expect(keyboardTop()).toBe('520px');
		stop();
	});

	// A few pixels of rounding, a rubber-band, or the browser's own bar retracting
	// is not a keyboard, and a transport that jumped for one would be worse than
	// one that never moved.
	it('ignores a drop too small to be a keyboard', async () => {
		const viewport = stubViewport(800);
		const stop = trackKeyboardInset();

		await viewport.set({ height: 750 });

		expect(keyboardTop()).toBe('');
		stop();
	});

	// A rotation is a new viewport, not a keyboard. Carried across one, the old
	// baseline reads the shorter landscape height as a keyboard that is not there.
	it('takes a new baseline when the viewport changes width', async () => {
		const viewport = stubViewport(800);
		const stop = trackKeyboardInset();

		await viewport.set({ width: 800, height: 380 });

		expect(keyboardTop()).toBe('');
		expect(root.dataset.keyboardInset).toBeUndefined();
		stop();
	});

	/**
	 * Observed, not defensive: dismissing the iOS screenshot preview moved the
	 * visible viewport and fired nothing, so the strip stayed pinned to where the
	 * viewport had been and sat halfway down the keyboard. Anything the system
	 * draws over the page can do this, so while a keyboard is up the tracker also
	 * re-reads on a timer.
	 */
	it('corrects itself when the viewport moves and fires nothing', async () => {
		const viewport = stubViewport(800);
		const stop = trackKeyboardInset();
		await viewport.set({ height: 480 });
		expect(keyboardTop()).toBe('480px');

		// Silently, the way the screenshot preview did it.
		Object.assign(window.visualViewport!, { offsetTop: 120 });
		await new Promise((resolve) => setTimeout(resolve, 700));

		expect(keyboardTop()).toBe('600px');
		stop();
	});

	it('unbinds and clears what it published', async () => {
		const viewport = stubViewport(800);
		const stop = trackKeyboardInset();
		await viewport.set({ height: 480 });

		stop();

		expect(viewport.listenerCount).toBe(0);
		expect(keyboardTop()).toBe('');
		expect(root.dataset.keyboardInset).toBeUndefined();
	});
});
