/**
 * A media element with no decoder behind it.
 *
 * A real `<audio>` cannot be driven deterministically in a test: `play()`
 * rejects on a synthetic object URL, and `currentTime` is ignored until metadata
 * arrives. What the media tests are checking is the transport's own arithmetic,
 * not the browser's, so they drive this instead.
 *
 * Test-only, and imported only from `*.test.ts` — it is here rather than beside
 * one of them because both the player's tests and the strip's need it.
 */
export class StubAudio extends EventTarget {
	currentTime = 0;
	duration = Number.NaN;
	playbackRate = 1;
	preservesPitch = false;
	preload = '';
	src = '';
	paused = true;

	play(): Promise<void> {
		if (this.paused) {
			this.paused = false;
			this.dispatchEvent(new Event('play'));
		}
		return Promise.resolve();
	}

	pause(): void {
		if (this.paused) return;
		this.paused = true;
		this.dispatchEvent(new Event('pause'));
	}

	removeAttribute(): void {}
	load(): void {}

	/** Announce a duration the way a browser does once it has read the file. */
	setDuration(seconds: number): void {
		this.duration = seconds;
		this.dispatchEvent(new Event('durationchange'));
	}

	asMediaElement(): HTMLMediaElement {
		return this as unknown as HTMLMediaElement;
	}
}
