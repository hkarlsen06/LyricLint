import type { Attachment } from 'svelte/attachments';

/**
 * Keep a scrolling transcript pinned to its own foot while it grows, and stop
 * the moment the reader says otherwise.
 *
 * An answer arrives a token at a time, so a transcript that does not follow its
 * own bottom edge shows the reader the top of a message and then leaves them
 * pressing End for the rest of it. The whole difficulty is the other half: a
 * reader who has scrolled up to check what was said earlier is doing that
 * *while* the stream is still running, and a follower that reads "content grew"
 * as "go to the bottom" hauls them back out of the message they are reading,
 * several times a second, with no way to win.
 *
 * So the rule is not about growth at all. It is about which way the scroll
 * moved:
 *
 * - **A pinned transcript is only ever unpinned by the scroll position moving
 *   up.** Appending to the foot of a scroller never moves `scrollTop`, so
 *   growth cannot look like a scroll — which is what makes this safe where
 *   comparing the distance to the bottom is not. That distance grows with every
 *   token, so a follower that read it would unpin itself mid-answer.
 * - **An unpinned transcript re-pins by reaching the bottom**, within
 *   `BOTTOM_THRESHOLD` of it. Nothing else re-pins it, because arriving at the
 *   foot is the one gesture that plainly means "I am caught up"; anything else
 *   would be the surface deciding the reader is done reading.
 *
 * That leaves one race, and it is the one that actually loses somebody's place.
 * A wheel gesture updates `scrollTop` immediately, but its `scroll` event is
 * dispatched at the top of the next frame — so a chunk of the answer landing in
 * between would be followed while this module still believed it was pinned, and
 * the reader's scroll would be silently eaten. Two things close it. The follow
 * is deferred to a `requestAnimationFrame`, which the specified frame ordering
 * runs *after* the scroll steps, so the unpin is already recorded by the time
 * anything moves. And the pointer gestures are read for intent directly —
 * `wheel` upward, a touch drag downward — which unpins before the scroll has
 * even happened. Either alone would be enough on most frames; both is what
 * makes it not depend on which.
 *
 * The scroll is instant, never smooth, for the reason sync mode's follow is: a
 * smooth scroll started on one chunk is still animating when the next arrives.
 *
 * `pin()` is the way back, and it belongs to the surface rather than to a
 * control here — sending a message is a request to see the answer to it, and so
 * is switching to another conversation.
 */

/**
 * How near the foot counts as being at it. A few pixels of slack, because
 * fractional device pixels and a wheel that lands one notch short are both the
 * reader being at the bottom.
 */
const BOTTOM_THRESHOLD = 24;

/** A touch has to travel this far before it is a scroll rather than a press. */
const TOUCH_DEADZONE = 4;

interface StickToBottom {
	/** Attach to the scrolling element itself, not to its content. */
	readonly attach: Attachment<HTMLElement>;
	/** Whether the transcript is currently following its own foot. */
	readonly pinned: boolean;
	/** Re-pin and go to the foot now, for a gesture that asked to be there. */
	pin(): void;
}

export function stickToBottom(): StickToBottom {
	let port: HTMLElement | undefined;
	let pinned = true;
	let lastTop = 0;

	function distanceFromBottom(node: HTMLElement): number {
		return node.scrollHeight - node.clientHeight - node.scrollTop;
	}

	function toBottom(node: HTMLElement): void {
		lastTop = node.scrollHeight - node.clientHeight;
		node.scrollTop = lastTop;
	}

	const attach: Attachment<HTMLElement> = (node) => {
		port = node;
		toBottom(node);

		let frame = 0;
		function follow(): void {
			if (frame) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				if (pinned) toBottom(node);
			});
		}

		function onScroll(): void {
			const top = node.scrollTop;
			// Growth cannot move the position up, so an upward move is the reader
			// and nothing else. Without this gate the distance below would unpin a
			// pinned transcript on the first chunk that outgrew the threshold.
			const movedUp = top < lastTop - 1;
			lastTop = top;
			if (pinned && !movedUp) return;
			pinned = distanceFromBottom(node) <= BOTTOM_THRESHOLD;
		}

		function onWheel(event: WheelEvent): void {
			if (event.deltaY < 0) pinned = false;
		}

		let touchOrigin: number | undefined;
		function onTouchStart(event: TouchEvent): void {
			touchOrigin = event.touches[0]?.clientY;
		}

		function onTouchMove(event: TouchEvent): void {
			const y = event.touches[0]?.clientY;
			// A finger travelling down the screen drags the content down, which is
			// the transcript scrolling up.
			if (y !== undefined && touchOrigin !== undefined && y > touchOrigin + TOUCH_DEADZONE) {
				pinned = false;
			}
		}

		const grew = new MutationObserver(follow);
		grew.observe(node, { childList: true, subtree: true, characterData: true });
		const resized = new ResizeObserver(follow);
		resized.observe(node);

		node.addEventListener('scroll', onScroll, { passive: true });
		node.addEventListener('wheel', onWheel, { passive: true });
		node.addEventListener('touchstart', onTouchStart, { passive: true });
		node.addEventListener('touchmove', onTouchMove, { passive: true });

		return () => {
			if (frame) cancelAnimationFrame(frame);
			grew.disconnect();
			resized.disconnect();
			node.removeEventListener('scroll', onScroll);
			node.removeEventListener('wheel', onWheel);
			node.removeEventListener('touchstart', onTouchStart);
			node.removeEventListener('touchmove', onTouchMove);
			if (port === node) port = undefined;
		};
	};

	return {
		attach,
		get pinned() {
			return pinned;
		},
		pin(): void {
			pinned = true;
			if (port) toBottom(port);
		}
	};
}
