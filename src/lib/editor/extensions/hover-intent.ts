/**
 * How long the pointer has to settle on one target before a surface appears.
 *
 * Long enough that crossing a lint-heavy verse on the way somewhere else opens
 * nothing, short enough to read as immediate to anyone who actually stopped.
 * A pointer merely passing through clears any one target well inside this.
 */
const hoverIntentDelay = 110;

/**
 * The wait a pointer serves before something in the editor reveals itself.
 *
 * Every pointer route onto a surface shares this — the severity underline, the
 * count badge at the end of the line, and the `⇄` beside a linked header — so a
 * pointer crossing a crowded line meets one rule rather than a different one per
 * target. A marker that opened on the bare `pointerenter` was the odd one out:
 * a mouse flying across the document to reach the panel dragged a card open
 * behind it for every linked header it passed over.
 *
 * Arming is a no-op for the target already pending, which is what lets a pointer
 * that comes to a complete stop, emitting no further events at all, still open
 * the surface. Targets are compared by identity, so the value armed with has to
 * be stable for as long as the pointer is on the same thing.
 */
export class HoverIntent<T> {
	private pending?: T;
	private timer?: ReturnType<typeof setTimeout>;

	constructor(private readonly reveal: (target: T) => void) {}

	arm(target: T): void {
		if (this.pending === target) {
			return;
		}
		this.cancel();
		this.pending = target;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.pending = undefined;
			this.reveal(target);
		}, hoverIntentDelay);
	}

	cancel(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.pending = undefined;
	}
}
