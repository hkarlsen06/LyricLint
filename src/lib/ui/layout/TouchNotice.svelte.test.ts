import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TouchNotice from './TouchNotice.svelte';

const SEEN_KEY = 'lyriclint:session-touch-notice';
const realMatchMedia = window.matchMedia;

/**
 * The notice asks one query and opens on the answer, so the query is what the
 * tests drive. A browser window cannot be given a coarse pointer.
 */
function pointer(matches: boolean) {
	vi.stubGlobal(
		'matchMedia',
		(query: string) =>
			({
				matches,
				media: query,
				addEventListener: () => {},
				removeEventListener: () => {}
			}) as unknown as MediaQueryList
	);
}

function notice() {
	return document.querySelector<HTMLDialogElement>('dialog.touch-notice');
}

describe('TouchNotice', () => {
	beforeEach(() => {
		sessionStorage.removeItem(SEEN_KEY);
	});

	afterEach(() => {
		vi.stubGlobal('matchMedia', realMatchMedia);
		sessionStorage.removeItem(SEEN_KEY);
	});

	// A narrow window on a laptop is a supported size with a keyboard behind it,
	// and a tablet in landscape gets the two-column layout — neither has anything
	// to be warned about.
	it('stays shut where the layout is not the compromised one', async () => {
		pointer(false);

		render(TouchNotice);

		expect(notice()?.open).toBe(false);
	});

	it('opens on a touch device in the stacked layout', async () => {
		pointer(true);

		render(TouchNotice);

		expect(notice()?.open).toBe(true);
		await expect
			.element(page.getByRole('heading', { name: 'LyricLint works best on a laptop' }))
			.toBeVisible();
	});

	/**
	 * Session-scoped, like the ignored rules: a warning that has been read is
	 * noise. It is remembered on `close` rather than in the button's own handler,
	 * so `Escape` and a press on the backdrop are remembered too — every way out is
	 * the same way out.
	 */
	it('does not open again once it has been dismissed this session', async () => {
		pointer(true);
		const first = render(TouchNotice);
		await page.getByRole('button', { name: 'Got it' }).click();
		expect(notice()?.open).toBe(false);
		first.unmount();

		render(TouchNotice);

		expect(notice()?.open).toBe(false);
	});

	it('remembers a dismissal that did not come from the button', async () => {
		pointer(true);
		render(TouchNotice);
		const dialog = notice();
		expect(dialog?.open).toBe(true);

		// What `Escape` and a press on the backdrop both do. Asserted on the stored
		// flag rather than on a second mount, because a closed `<dialog>` is still
		// in the document and a second one would not be the element found first.
		dialog?.close();
		await vi.waitFor(() => expect(sessionStorage.getItem(SEEN_KEY)).toBe('1'));
	});
});
