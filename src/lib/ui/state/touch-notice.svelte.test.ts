import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeedbackState } from './feedback.svelte.js';
import { TOUCH_NOTICE_DURATION, TOUCH_NOTICE_MESSAGE, noticeTouchLayout } from './touch-notice.js';

const SEEN_KEY = 'lyriclint:session-touch-notice';
const realMatchMedia = window.matchMedia;

/**
 * The notice asks one query and speaks on the answer, so the query is what the
 * tests drive. A browser window cannot be given a coarse pointer.
 *
 * A browser test rather than a node one because the rule is written against the
 * two browser globals it reads — `matchMedia` and a real `sessionStorage` — and
 * a fake of the second would be testing the fake's `try`/`catch` rather than the
 * module's.
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

describe('noticeTouchLayout', () => {
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
	it('says nothing where the layout is not the compromised one', () => {
		pointer(false);
		const feedback = createFeedbackState();

		noticeTouchLayout(feedback);

		expect(feedback.toasts).toHaveLength(0);
	});

	it('raises a toast on a touch device in the stacked layout', () => {
		pointer(true);
		const feedback = createFeedbackState();

		noticeTouchLayout(feedback);

		expect(feedback.toasts).toHaveLength(1);
		expect(feedback.toasts[0]?.message).toBe(TOUCH_NOTICE_MESSAGE);
		// A recommendation with nothing to undo and nothing to confirm. The
		// region's own dismiss is the only control it needs.
		expect(feedback.toasts[0]?.action).toBeUndefined();
		expect(feedback.toasts[0]?.duration).toBe(TOUCH_NOTICE_DURATION);
	});

	/**
	 * The toast region is not a live region, and this message is the one thing in
	 * the workbench that arrives without the user having done anything — so a
	 * phone visitor running a screen reader would otherwise be the only person it
	 * is about who never hears it.
	 */
	it('announces the same words it draws', () => {
		pointer(true);
		const feedback = createFeedbackState();

		noticeTouchLayout(feedback);

		expect(feedback.announcement).toBe(TOUCH_NOTICE_MESSAGE);
	});

	/**
	 * Session-scoped, like the ignored rules: a warning that has been read is
	 * noise. Remembered on the *showing* rather than on a dismissal, because a
	 * toast retires itself — there is no press that means "read", so gating on one
	 * would bring back a notice the user watched go by.
	 */
	it('speaks once a session, whether or not the toast was pressed', () => {
		pointer(true);
		const first = createFeedbackState();
		noticeTouchLayout(first);
		expect(sessionStorage.getItem(SEEN_KEY)).toBe('1');

		const second = createFeedbackState();
		noticeTouchLayout(second);

		expect(second.toasts).toHaveLength(0);
	});
});
