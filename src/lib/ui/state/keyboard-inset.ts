/**
 * Where the software keyboard's top edge is, published to CSS.
 *
 * A phone keyboard covers the foot of the workbench — the transport included —
 * because the page is laid out against a viewport the keyboard does not shrink.
 * On the one device where every control has to be reachable by finger, the
 * transport was the row you could not reach while typing.
 *
 * **Nothing here reads `window.innerHeight`, and that is the whole design.** The
 * obvious measurement is `innerHeight - visualViewport.height`, and it is the one
 * that failed on a real phone: what the layout viewport does when a keyboard
 * opens is browser lore that differs by engine and by version, and a rule built
 * on it is a rule that silently does nothing on the device it was written for.
 *
 * Both published values come from `visualViewport` alone:
 *
 * - **`--keyboard-top`** is `offsetTop + height` — the bottom edge of what the
 *   user can see, in the coordinate space `position: fixed` is measured against.
 *   That is the keyboard's top edge whether or not the layout viewport shrank
 *   with it, so the same arithmetic is right under either behaviour.
 * - **`data-keyboard-inset`** says a keyboard is up, decided by how far the
 *   visible height has fallen below the tallest this session has seen. A drop is
 *   observable without knowing what it is a drop *from*, which is exactly the
 *   thing we could not establish.
 *
 * `env(keyboard-inset-height)` would answer both directly and is not an option:
 * it belongs to the VirtualKeyboard API, which Safari does not implement, and
 * `interactiveWidget` in the viewport meta is Chrome on Android.
 *
 * Publishing lengths and a flag, and moving nothing, keeps where a band sits in
 * the stylesheet with every other decision of that kind.
 */

/**
 * Below this the drop is rounding, a rubber-band, or the browser's own bar
 * retracting — not a keyboard. Every software keyboard is far taller.
 */
const KEYBOARD_MIN_PX = 100;

export function trackKeyboardInset(): () => void {
	const viewport = window.visualViewport;
	// Every browser this matters on has it. Without it there is nothing to measure
	// and nothing to publish, which leaves the layout exactly as it is.
	if (!viewport) return () => {};

	const root = document.documentElement;
	let frame = 0;
	let poll = 0;
	// The tallest the visible viewport has been, which is what it is with no
	// keyboard up. Kept rather than derived, because there is no property that
	// reports it.
	let baseline = viewport.height;
	// Rotating changes what "no keyboard" is worth, and a baseline carried across
	// a rotation reads the new height as a keyboard that is not there.
	let baselineWidth = viewport.width;

	/**
	 * While the strip is hanging off the viewport, re-read it on a timer as well.
	 *
	 * The events are not enough on their own, and that is observed rather than
	 * defensive: dismissing the iOS screenshot preview moved the visible viewport
	 * and fired nothing we heard, so the strip stayed pinned to where the viewport
	 * had been and sat halfway down the keyboard until something else happened.
	 * Anything the system draws over the page can do this.
	 *
	 * Twice a second, and only while a keyboard is up — this is a pair of property
	 * reads, and it cannot run at all in the state the workbench spends its life
	 * in. A `requestAnimationFrame` loop would catch the same thing sooner and
	 * spend sixty frames a second doing it.
	 */
	const startPoll = () => {
		if (!poll) poll = window.setInterval(() => measure(), 500);
	};

	const stopPoll = () => {
		if (!poll) return;
		clearInterval(poll);
		poll = 0;
	};

	const clear = () => {
		stopPoll();
		root.style.removeProperty('--keyboard-top');
		delete root.dataset.keyboardInset;
	};

	const measure = () => {
		frame = 0;
		if (viewport.width !== baselineWidth) {
			baselineWidth = viewport.width;
			baseline = viewport.height;
		}
		// A keyboard only ever makes this smaller, so the largest seen is the one
		// with nothing over it.
		if (viewport.height > baseline) baseline = viewport.height;

		if (baseline - viewport.height < KEYBOARD_MIN_PX) {
			clear();
			return;
		}

		// `offsetTop` is how far the visible viewport has been pushed down inside
		// the layout one, which iOS does to bring the caret into view. It is part of
		// where the bottom edge lands and dropping it puts the strip over the keys.
		root.style.setProperty(
			'--keyboard-top',
			`${Math.round(viewport.offsetTop + viewport.height)}px`
		);
		root.dataset.keyboardInset = '';
		startPoll();
	};

	// Both events fire in bursts while the keyboard animates in, and each one
	// would otherwise write to the style attribute and force a layout.
	const schedule = () => {
		if (frame) return;
		frame = requestAnimationFrame(measure);
	};

	viewport.addEventListener('resize', schedule);
	viewport.addEventListener('scroll', schedule);
	measure();

	return () => {
		if (frame) cancelAnimationFrame(frame);
		viewport.removeEventListener('resize', schedule);
		viewport.removeEventListener('scroll', schedule);
		clear();
	};
}
