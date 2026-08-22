import type { YouTubeApi, YouTubePlayerLike, YouTubePlayerOptions } from './media-youtube.js';

/**
 * The IFrame API with no Google behind it.
 *
 * The real one is a script fetched from `youtube.com` and a player that answers
 * across a postMessage bridge, so a test that used it would be a test of the
 * network. What the media tests check is the transport's arithmetic against a
 * source that reports late, which is exactly what this reproduces: `seekTo` and
 * the state changes only take effect when the test says they do.
 *
 * Test-only, and imported only from `*.test.ts`. It is here rather than beside
 * one of them because the player's tests, the store's, and the strip's all need
 * it — the same reason `media-test-audio.ts` sits here.
 */

/** The numbers the IFrame API uses for player state. */
export const stubPlayerState = {
	UNSTARTED: -1,
	ENDED: 0,
	PLAYING: 1,
	PAUSED: 2,
	BUFFERING: 3,
	CUED: 5
} as const;

class StubYouTubePlayer implements YouTubePlayerLike {
	currentTime = 0;
	length = 0;
	rate = 1;
	/**
	 * YouTube's own menu, which is wider at both ends than the workbench offers.
	 * A test that wants the narrowing behaviour sets this to something smaller.
	 */
	rates: number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
	title: string | undefined;
	destroyed = false;
	/**
	 * How far behind the player runs.
	 *
	 * `0` is a player that answers instantly, which no real one does. Anything
	 * higher holds `getCurrentTime` at its previous answer for that many reads
	 * after a seek, which is the gap the source exists to hide.
	 */
	seekLatencyReads = 0;

	readonly options: YouTubePlayerOptions;
	private pendingSeek: number | undefined;
	private latencyLeft = 0;
	private readonly host: HTMLElement;

	constructor(host: HTMLElement, options: YouTubePlayerOptions) {
		this.host = host;
		this.options = options;
	}

	/** Say the player is ready, the way the API's `onReady` does. */
	ready(options: { duration?: number; title?: string } = {}): void {
		if (options.duration !== undefined) this.length = options.duration;
		if (options.title !== undefined) this.title = options.title;
		this.options.events?.onReady?.();
	}

	/** Announce a state change, the way the API's `onStateChange` does. */
	setState(state: number): void {
		this.options.events?.onStateChange?.({ data: state });
	}

	fail(code = 5): void {
		this.options.events?.onError?.({ data: code });
	}

	playVideo(): void {
		this.setState(stubPlayerState.PLAYING);
	}

	pauseVideo(): void {
		this.setState(stubPlayerState.PAUSED);
	}

	seekTo(seconds: number): void {
		if (this.seekLatencyReads > 0) {
			this.pendingSeek = seconds;
			this.latencyLeft = this.seekLatencyReads;
			return;
		}
		this.currentTime = seconds;
	}

	getCurrentTime(): number {
		if (this.pendingSeek !== undefined) {
			this.latencyLeft -= 1;
			if (this.latencyLeft <= 0) {
				this.currentTime = this.pendingSeek;
				this.pendingSeek = undefined;
			}
		}
		return this.currentTime;
	}

	getDuration(): number {
		return this.length;
	}

	setPlaybackRate(rate: number): void {
		this.rate = rate;
	}

	getAvailablePlaybackRates(): number[] {
		return [...this.rates];
	}

	getVideoData(): { title?: string } {
		return this.title === undefined ? {} : { title: this.title };
	}

	cueVideoById(options: { videoId: string; startSeconds?: number }): void {
		this.currentTime = options.startSeconds ?? 0;
		this.pendingSeek = undefined;
	}

	destroy(): void {
		this.destroyed = true;
		this.host.remove();
	}
}

interface StubYouTubeApi {
	api: YouTubeApi;
	/** How many times the loader was called; the opt-in gate is read off this. */
	loads: number;
	/** The players built so far, newest last. */
	players: StubYouTubePlayer[];
	load(): Promise<YouTubeApi>;
}

/** An API loader that never leaves the process. */
export function createStubYouTubeApi(): StubYouTubeApi {
	const stub: StubYouTubeApi = {
		loads: 0,
		players: [],
		api: {
			// A subclass rather than a class that builds one and returns it: the
			// instance *is* the stub player, so nothing has to be asserted about it
			// on the way to `YouTubeApi['Player']`.
			Player: class extends StubYouTubePlayer {
				constructor(host: HTMLElement, options: YouTubePlayerOptions) {
					super(host, options);
					stub.players.push(this);
				}
			},
			PlayerState: stubPlayerState
		},
		async load() {
			stub.loads += 1;
			return stub.api;
		}
	};
	return stub;
}

/**
 * A poll the test advances by hand.
 *
 * The source's loop is a real interval in the browser; here it is a function the
 * test calls, so "the poll stopped" is an assertion rather than a wait.
 */
export function createStubPoll() {
	let tick: (() => void) | undefined;
	let starts = 0;
	let stops = 0;
	let intervalMs: number | undefined;

	return {
		get running() {
			return tick !== undefined;
		},
		get starts() {
			return starts;
		},
		get stops() {
			return stops;
		},
		/** What the source asked to be ticked at. */
		get intervalMs() {
			return intervalMs;
		},
		/** Run the loop once, or do nothing if it is not running. */
		advance(times = 1): void {
			for (let index = 0; index < times; index += 1) tick?.();
		},
		schedule(next: () => void, requestedIntervalMs: number): () => void {
			tick = next;
			intervalMs = requestedIntervalMs;
			starts += 1;
			return () => {
				tick = undefined;
				stops += 1;
			};
		}
	};
}
