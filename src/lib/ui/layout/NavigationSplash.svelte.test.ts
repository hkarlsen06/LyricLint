import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { waitFor } from '@testing-library/dom';
import NavigationSplash from './NavigationSplash.svelte';

test('a skipped entry callback cannot bring back a cancelled splash', async () => {
	const completed = Promise.withResolvers<void>();
	let update: (() => void | Promise<void>) | undefined;
	const skipTransition = vi.fn();
	const start = vi.spyOn(document, 'startViewTransition').mockImplementation((callback) => {
		if (typeof callback === 'function') update = callback;
		return {
			ready: Promise.resolve(),
			updateCallbackDone: Promise.resolve(),
			finished: completed.promise,
			skipTransition,
			types: new Set<string>()
		} as ViewTransition;
	});
	const view = await render(NavigationSplash, { active: false });
	try {
		expect(start).not.toHaveBeenCalled();
		await view.rerender({ active: true });
		expect(start).toHaveBeenCalledTimes(1);
		window.dispatchEvent(new PointerEvent('pointerdown'));
		await view.rerender({ active: false });
		expect(skipTransition).toHaveBeenCalled();
		// Native skipTransition still calls the update, even after cancellation.
		await update?.();
		completed.resolve();
		await waitFor(() => {
			expect(view.container.querySelector('.navigation-splash')).toBeNull();
			expect(document.documentElement.hasAttribute('data-navigation-transition')).toBe(false);
		});
	} finally {
		completed.resolve();
		await view.unmount();
		start.mockRestore();
	}
});

test('a ready destination still gets the spring and explosion after a delayed entry callback', async () => {
	const completed = Promise.withResolvers<void>();
	const updates: (() => void | Promise<void>)[] = [];
	const start = vi.spyOn(document, 'startViewTransition').mockImplementation((callback) => {
		if (typeof callback === 'function') updates.push(callback);
		return {
			ready: Promise.resolve(),
			updateCallbackDone: Promise.resolve(),
			finished: completed.promise,
			skipTransition: vi.fn(),
			types: new Set<string>()
		} as ViewTransition;
	});
	const view = await render(NavigationSplash, { active: false });
	try {
		await view.rerender({ active: true });
		await view.rerender({ active: false });
		await updates[0]();
		const splash = view.container.querySelector('.navigation-splash') as HTMLElement;
		// The spring waits for the entry crossfade so the two never share frames.
		expect(splash.dataset.stage).toBe('hold');
		completed.resolve();
		await waitFor(() => expect(splash.dataset.stage).toBe('pull'));
		expect(start).toHaveBeenCalledTimes(1);
		await waitFor(() => {
			const mark = splash.querySelector('.app-wordmark') as HTMLElement;
			expect(Number(getComputedStyle(mark).getPropertyValue('--wm-open'))).toBeGreaterThan(1);
		});
		await waitFor(() => expect(splash.hasAttribute('data-leaving')).toBe(true));
		expect(splash.dataset.stage).toBe('land');
		await waitFor(() => {
			const shock = Number(getComputedStyle(splash).getPropertyValue('--boot-shock'));
			expect(shock).toBeGreaterThan(0);
			expect(shock).toBeLessThan(1);
		});
		expect(start).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
		expect(Number(getComputedStyle(splash).getPropertyValue('--boot-shock'))).toBe(1);
		await updates[1]();
		expect(view.container.querySelector('.navigation-splash')).toBeNull();
	} finally {
		completed.resolve();
		await view.unmount();
		start.mockRestore();
	}
});
