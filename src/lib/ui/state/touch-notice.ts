/**
 * What a touch user is told on the way in: the workbench runs here, and it runs
 * better on a laptop.
 *
 * It used to be a modal, and the modal was out of proportion to what it says.
 * Nothing here is a decision — the message is a recommendation, everything in
 * the workbench works either way, and there is no second path to offer. A
 * surface that dims the window and takes focus is for a question that must be
 * answered before anything else happens, and this is the opposite of one: the
 * first thing a phone visitor met was a screen standing between them and the
 * document they came to open. It is a toast now, which says the same thing
 * beside the workbench instead of in front of it, and retires itself.
 *
 * That is also why this is a module rather than a component. The dialog *was*
 * the surface, so it had markup and styles of its own; what is left is a rule
 * about when to say something, and the region that draws it is already mounted
 * by the app layout.
 */

import { browser } from '$app/environment';

import type { FeedbackState } from './feedback.svelte.js';

/**
 * A coarse pointer *and* the stacked layout, from the one place that answers
 * that question — the cover band's default fold reads the same query, and two
 * copies of a breakpoint are two things to remember when it moves.
 */
import { PHONE_LAYOUT_QUERY } from './phone-layout.js';

/**
 * Session-scoped, like the ignored rules and for the same reason: a warning
 * that has been read is noise, and one that is never repeated is a warning the
 * user cannot get back. Closing the tab is what forgets it.
 */
const SEEN_KEY = 'lyriclint:session-touch-notice';

/**
 * Longer than either toast default, and the two reasons are the message and the
 * device.
 *
 * `INFO_TOAST_DURATION` is sized for a confirmation of something the user just
 * did, which they already know the content of; this is a sentence they have
 * never read, arriving unasked. And the countdown pauses on hover, which is a
 * gesture a finger does not have — so on the one device this ever appears on,
 * the time on screen is the whole of the reading time.
 */
export const TOUCH_NOTICE_DURATION = 12_000;

/**
 * The reassurance leads, because the message arrives uninvited and the first
 * thing a visitor needs to know is that they have not hit a wall. What follows
 * is the two facts that are actually different, rather than a description of
 * the product they are already looking at — and both are anchored to the
 * laptop, because the earlier wording hung "every fix has a keyboard shortcut"
 * on "here", which is a device that has no keyboard.
 */
export const TOUCH_NOTICE_MESSAGE =
	'Everything works on a phone, but LyricLint is quicker on a laptop, where the lyrics sit beside the findings and every fix has a keyboard shortcut.';

// A browser refusing storage reads as "not seen", which shows the notice once
// per load rather than losing it — the harmless direction of this failure.
function alreadySeen(): boolean {
	try {
		return sessionStorage.getItem(SEEN_KEY) !== null;
	} catch {
		return false;
	}
}

/**
 * Remembered when it is *shown*, not when it is dismissed.
 *
 * The dialog could wait for a press because it had to be answered to get out of
 * the way. A toast retires itself, so there is no press that means "read" — the
 * X and the countdown are the same way out, and gating on one of them would
 * mean a notice the user watched go by came back on the next reload of the same
 * session.
 */
function remember(): void {
	try {
		sessionStorage.setItem(SEEN_KEY, '1');
	} catch {
		// A browser refusing storage is not a reason to fail to open a draft. The
		// cost is the notice appearing again next time, which is the harmless
		// direction.
	}
}

/**
 * Say it, if this is the layout it is about and the session has not heard it.
 *
 * The toast carries no action: there is nothing to undo and nothing to confirm,
 * and the region's own dismiss is the only control such a message needs. It is
 * announced as well as drawn, because the toast region is not a live region —
 * a phone visitor running a screen reader is exactly who this is for.
 */
export function noticeTouchLayout(feedback: FeedbackState): void {
	if (alreadySeen()) return;
	// Nothing to say under prerender, and nothing to ask on a browser old enough
	// to be missing `matchMedia` — which is also every non-DOM host this module
	// could be imported into.
	if (!browser || !('matchMedia' in window)) return;
	if (!window.matchMedia(PHONE_LAYOUT_QUERY).matches) return;

	remember();
	feedback.announce(TOUCH_NOTICE_MESSAGE);
	feedback.addToast({ message: TOUCH_NOTICE_MESSAGE, duration: TOUCH_NOTICE_DURATION });
}
