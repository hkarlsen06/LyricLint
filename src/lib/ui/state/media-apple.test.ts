import { describe, expect, it, vi } from 'vitest';
import type { AppleMusicInstance, AppleMusicSource, AppleMusicTimeEvent } from './media-apple.js';
import {
	appleMusicConfigured,
	appleMusicTokenExpiry,
	authorizeAppleMusic,
	createAppleMusicSource,
	loadMusicKit,
	parseAppleMusicSongId,
	resetAppleMusic,
	searchAppleMusicSongs,
	settleMaxEvents
} from './media-apple.js';
import type { MediaSourceEvents } from './media-player.svelte.js';
import { remoteLoadTimeoutMs } from './media-remote-policy.js';

const songId = '1091453645';
const otherSongId = '1440913430';
const albumId = '1440913429';

describe('parseAppleMusicSongId', () => {
	it('reads the forms that actually reach a clipboard', () => {
		for (const input of [
			songId,
			// The share sheet's own form, and the one nearly everybody will paste:
			// the path names the *album* and the song hangs off it as `?i=`.
			`https://music.apple.com/no/album/cloud-nine/${albumId}?i=${songId}`,
			`https://music.apple.com/us/song/stole-the-show/${songId}`,
			`https://music.apple.com/song/${songId}`,
			`music.apple.com/gb/song/whatever/${songId}?l=en`,
			`https://embed.music.apple.com/no/song/x/${songId}`
		]) {
			expect(parseAppleMusicSongId(input), input).toEqual({ songId });
		}
	});

	// The album link carries a perfectly valid id in its path, so a parser that
	// read the path first would attach the album's opening track for every share
	// link Apple produces — silently, and only for songs that are not track one.
	it('prefers the song hanging off an album link to the album itself', () => {
		expect(
			parseAppleMusicSongId(`https://music.apple.com/no/album/x/${albumId}?i=${songId}`)
		).toEqual({ songId });
	});

	it('refuses everything that is not one song', () => {
		for (const input of [
			'',
			'https://example.com/song/1234',
			`https://music.apple.com/no/album/cloud-nine/${albumId}`,
			`https://music.apple.com/no/playlist/x/pl.${songId}`,
			'https://music.apple.com/no/song/x/not-a-number'
		]) {
			expect(parseAppleMusicSongId(input), input).toHaveProperty('error');
		}
	});
});

/**
 * The load that never answers, and what it costs three surfaces away.
 *
 * MusicKit announces itself with a `musickitloaded` event, and an ad blocker, a
 * content policy or a stalled CDN leaves the script tag in the document and that
 * event unfired. With no timeout the promise is pending for the life of the page,
 * so `attachAppleMusicSong`'s `finally` never runs and `busy` stays true — which
 * is the same three-unrelated-faults presentation a blocked sign-in pop-up had,
 * arriving one step earlier.
 */
describe('loading MusicKit', () => {
	it('rejects when the script never answers', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('document', {
			addEventListener: vi.fn(),
			createElement: () => ({ src: '', async: false, addEventListener: vi.fn() }),
			head: { appendChild: vi.fn() }
		});

		const loading = loadMusicKit();
		const rejected = expect(loading).rejects.toThrow('did not load in time');

		await vi.advanceTimersByTimeAsync(remoteLoadTimeoutMs);
		await rejected;
		resetAppleMusic();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
});

describe('appleMusicConfigured', () => {
	// The suite pins a token expiring in 2100 in `vite.config.ts`, so the feature
	// is on by default here — which is what every other Apple Music test rests on.
	it('is on for a token that is in date', () => {
		expect(appleMusicConfigured()).toBe(true);
	});

	/**
	 * The rule this function exists for, and the one that will actually fire.
	 *
	 * A developer token lasts at most six months, so the failure this application
	 * meets in production is not a missing token but a stale one — and a stale one
	 * otherwise fails as a 401 under a press, several steps after the point where
	 * anything could have said so.
	 */
	it('goes off once the token has expired, without waiting for a 401', () => {
		const expiry = appleMusicTokenExpiry(
			'eyJhbGciOiJFUzI1NiIsImtpZCI6IlRFU1RLRVlJRCJ9.eyJpc3MiOiJURVNUVEVBTUlEIiwiaWF0IjowLCJleHAiOjQxMDI0NDQ4MDB9.testsignature'
		);
		expect(expiry).toBe(4_102_444_800_000);
		expect(appleMusicConfigured(expiry! + 1)).toBe(false);
	});

	it('treats a token it cannot read as unusable rather than as unlimited', () => {
		expect(appleMusicTokenExpiry('not-a-jwt')).toBeUndefined();
		expect(appleMusicTokenExpiry('a.bbbb.c')).toBeUndefined();
	});
});

describe('searchAppleMusicSongs', () => {
	const storefrontId = 'no';
	const music = () => Promise.resolve({ storefrontId } as AppleMusicInstance);

	const payload = {
		results: {
			songs: {
				data: [
					{
						id: songId,
						attributes: { name: 'Stole the Show', artistName: 'Kygo', durationInMillis: 223_000 }
					},
					// No id, so it cannot be attached and must not be offered.
					{ attributes: { name: 'Broken', artistName: 'Nobody', durationInMillis: 1000 } }
				]
			}
		}
	};

	it('searches the user’s own storefront and returns what can be attached', async () => {
		let asked: string | undefined;
		const outcome = await searchAppleMusicSongs('kygo stole the show', {
			music,
			request: (async (url: RequestInfo | URL) => {
				asked = String(url);
				return new Response(JSON.stringify(payload), {
					headers: { 'content-type': 'application/json' }
				});
			}) as typeof fetch
		});

		// The storefront is not decoration: a search against the wrong one returns
		// songs the subscription cannot play.
		expect(asked).toContain(`/catalog/${storefrontId}/search`);
		expect(asked).toContain('types=songs');
		expect(outcome).toEqual({
			results: [{ songId, name: 'Kygo — Stole the Show', durationSeconds: 223 }]
		});
	});

	it('names an expired token rather than reporting a generic failure', async () => {
		const outcome = await searchAppleMusicSongs('anything', {
			music,
			request: (async () => new Response('', { status: 401 })) as typeof fetch
		});
		expect(outcome).toEqual({ error: 'This build’s Apple Music token has expired.' });
	});
});

/** Every event the transport can be told about, recorded rather than acted on. */
function recorder(): MediaSourceEvents & { readonly log: string[] } {
	const log: string[] = [];
	return {
		log,
		timeChanged: (time) => void log.push(`time:${time}`),
		durationChanged: (duration) => void log.push(`duration:${duration}`),
		ratesChanged: (rates) => void log.push(`rates:${rates.join(',')}`),
		named: (name) => void log.push(`named:${name}`),
		artworkChanged: (url) => void log.push(`artwork:${url ?? 'none'}`),
		detailsChanged: (details) => void log.push(`details:${JSON.stringify(details ?? null)}`),
		started: () => void log.push('started'),
		stopped: () => void log.push('stopped'),
		ended: () => void log.push('ended'),
		failed: (message) => void log.push(`failed:${message}`)
	};
}

/**
 * MusicKit, stubbed down to the surface `AppleMusicInstance` names.
 *
 * What makes it worth having is that `setQueue` and `play` are spies: they are
 * what turn "attaching a song plays nothing" from a hope into an assertion.
 */
function stubMusic(overrides: Partial<AppleMusicInstance> = {}) {
	const listeners = new Map<string, (event: never) => void>();
	const instance = {
		isAuthorized: true,
		storefrontId: 'no',
		currentPlaybackTime: 0,
		currentPlaybackDuration: 0,
		playbackRate: 1,
		authorize: vi.fn(async () => 'user-token'),
		setQueue: vi.fn(async () => undefined),
		play: vi.fn(async () => undefined),
		pause: vi.fn(),
		stop: vi.fn(async () => undefined),
		seekToTime: vi.fn(async () => undefined),
		addEventListener: (name: string, handler: (event: never) => void) => {
			listeners.set(name, handler);
		},
		removeEventListener: (name: string) => void listeners.delete(name),
		...overrides
	} as unknown as AppleMusicInstance & {
		setQueue: ReturnType<typeof vi.fn>;
		play: ReturnType<typeof vi.fn>;
		seekToTime: ReturnType<typeof vi.fn>;
		authorize: ReturnType<typeof vi.fn>;
	};
	/**
	 * The player runs on without saying so.
	 *
	 * `currentPlaybackTime` is a live property and `playbackTimeDidChange` is a
	 * periodic announcement about it, so between two events the property moves and
	 * nothing fires. That gap is the whole reason `time` reads the property: a
	 * source answering from the last event hands `liveTime()` — which is what a
	 * sync tap stamps — the same stale number the mirror already holds.
	 */
	const advance = (seconds: number) => {
		(instance as unknown as { currentPlaybackTime: number }).currentPlaybackTime = seconds;
	};

	return {
		instance,
		advance,
		// An event fires *because* the property moved, so a stub letting the two
		// disagree would be modelling a player that does not exist.
		emit: (name: string, event: unknown) => {
			if (name === 'playbackTimeDidChange') {
				const time = (event as AppleMusicTimeEvent | undefined)?.currentPlaybackTime;
				if (typeof time === 'number') advance(time);
			}
			listeners.get(name)?.(event as never);
		}
	};
}

/** A macrotask, which is long enough for anything queued to have run. */
async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A `setQueue` the test answers by hand, one call at a time.
 *
 * The queue is the longest await in `load`, so it is where a second load
 * overtakes the first — and answering the two out of order is the whole of what
 * a staleness guard has to survive.
 */
function deferredQueues() {
	const calls: { song: string; settle: (error?: Error) => void }[] = [];
	const setQueue = vi.fn(
		async (options: { song: string }) =>
			await new Promise<unknown>((resolve, reject) => {
				calls.push({
					song: options.song,
					settle: (error) => (error ? reject(error) : resolve(undefined))
				});
			})
	);

	return {
		setQueue,
		calls: () => calls,
		pending: () => calls.length,
		resolve: (index: number) => calls[index]?.settle(),
		reject: (index: number, error: Error) => calls[index]?.settle(error)
	};
}

const playbackStates = { playing: 2, paused: 3, stopped: 4, ended: 5, completed: 10 };

const songPayload = {
	data: [
		{
			id: songId,
			attributes: {
				name: 'Stole the Show',
				artistName: 'Kygo',
				durationInMillis: 223_000,
				// Apple's artwork field is a template, not an address.
				artwork: { url: 'https://is1-ssl.mzstatic.com/image/thumb/x/{w}x{h}bb.jpg' },
				releaseDate: '2015-03-23',
				composerName: 'Kygo, Parker Ighile',
				isrc: 'NOG841578501',
				albumName: 'Cloud Nine'
			},
			// The label lives here and nowhere else, which is what `include=albums`
			// on the read is for.
			relationships: { albums: { data: [{ attributes: { recordLabel: 'Ultra Records' } }] } }
		}
	]
};

function build(
	music: AppleMusicInstance,
	rates: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5]
): { source: AppleMusicSource; events: ReturnType<typeof recorder> } {
	const events = recorder();
	const source = createAppleMusicSource({
		events,
		music: async () => music,
		playbackStates: async () => playbackStates,
		rates,
		request: (async () =>
			new Response(JSON.stringify(songPayload), {
				headers: { 'content-type': 'application/json' }
			})) as typeof fetch
	});
	return { source, events };
}

describe('createAppleMusicSource', () => {
	/**
	 * The whole reason this source is worth having over Spotify's.
	 *
	 * Spotify exposes no rate at any layer, so its source narrows the workbench's
	 * offer to `[1]` and announces it. This one keeps the offer — and has to claim
	 * it back explicitly, because the transport does not reset `availableRates`
	 * between attachments and a song attached after a Spotify track would
	 * otherwise inherit that narrowing.
	 */
	it('keeps the full rate offer and applies the chosen rate', async () => {
		const { instance } = stubMusic();
		const { source, events } = build(instance);

		await source.load(songId);
		expect(events.log).toContain('rates:0.5,0.75,1,1.25,1.5');

		source.setRate(0.75);
		expect(instance.playbackRate).toBe(0.75);
	});

	// MusicKit has a real cue, which is what keeps attaching from being an
	// instruction to play. Spotify has none and has to defer its start; this one
	// simply queues.
	it('queues without playing, and names the song from the catalogue', async () => {
		const { instance } = stubMusic();
		const { source, events } = build(instance);

		await source.load(songId);

		expect(instance.setQueue).toHaveBeenCalledWith(
			expect.objectContaining({ song: songId, startPlaying: false })
		);
		expect(instance.play).not.toHaveBeenCalled();
		expect(events.log).toContain('named:Kygo — Stole the Show');
		expect(events.log).toContain('duration:223');
	});

	/**
	 * Apple hands back a URL with `{w}` and `{h}` still in it.
	 *
	 * Passed through unresolved it is not an address at all, and the panel draws a
	 * broken image — so the substitution is the whole of what this reports, and a
	 * size has to be chosen somewhere. Here, because the CDN renders whatever is
	 * asked for and the alternative is every surface picking its own.
	 */
	it('resolves the artwork template to a real address', async () => {
		const { instance } = stubMusic();
		const { source, events } = build(instance);

		await source.load(songId);

		expect(events.log).toContain(
			'artwork:https://is1-ssl.mzstatic.com/image/thumb/x/640x640bb.jpg'
		);
	});

	it('reports no artwork for a song that has none, rather than a broken address', async () => {
		const { instance } = stubMusic();
		const events = recorder();
		const source = createAppleMusicSource({
			events,
			music: async () => instance,
			playbackStates: async () => playbackStates,
			rates: [1],
			request: (async () =>
				new Response(JSON.stringify({ data: [{ id: songId, attributes: { name: 'Untitled' } }] }), {
					headers: { 'content-type': 'application/json' }
				})) as typeof fetch
		});

		await source.load(songId);

		expect(events.log).toContain('artwork:none');
	});

	/*
	 * The facts a song page somewhere else asks for, from the read that was
	 * already paying for the name — including the label, which is why that read
	 * asks for `include=albums` rather than making a second request for one
	 * string. Producers are not among them and never will be: Apple's public
	 * catalogue has no credits resource at all.
	 */
	it('reports the song facts the catalogue carries, label included', async () => {
		const { instance } = stubMusic();
		const { source, events } = build(instance);

		await source.load(songId);

		expect(events.log).toContain(
			`details:${JSON.stringify({
				artist: 'Kygo',
				title: 'Stole the Show',
				releaseDate: '2015-03-23',
				writers: 'Kygo, Parker Ighile',
				isrc: 'NOG841578501',
				album: 'Cloud Nine',
				label: 'Ultra Records'
			})}`
		);
	});

	it('asks for the album alongside the song, in one request', async () => {
		const { instance } = stubMusic();
		const asked: string[] = [];
		const events = recorder();
		const source = createAppleMusicSource({
			events,
			music: async () => instance,
			playbackStates: async () => playbackStates,
			rates: [1],
			request: (async (url: RequestInfo | URL) => {
				asked.push(String(url));
				return new Response(JSON.stringify(songPayload), {
					headers: { 'content-type': 'application/json' }
				});
			}) as typeof fetch
		});

		await source.load(songId);

		expect(asked).toHaveLength(1);
		expect(asked[0]).toContain('include=albums');
	});

	// A field the catalogue does not carry is left out rather than emptied, so a
	// list of these is a list of things that are actually known — and a song with
	// nothing at all reports nothing rather than an empty list.
	it('leaves out what it does not know', async () => {
		const { instance } = stubMusic();
		const events = recorder();
		const source = createAppleMusicSource({
			events,
			music: async () => instance,
			playbackStates: async () => playbackStates,
			rates: [1],
			request: (async () =>
				new Response(
					JSON.stringify({
						data: [{ id: songId, attributes: { name: 'Untitled', releaseDate: '2020-01-01' } }]
					}),
					{ headers: { 'content-type': 'application/json' } }
				)) as typeof fetch
		});

		await source.load(songId);

		expect(events.log).toContain(
			`details:${JSON.stringify({ title: 'Untitled', releaseDate: '2020-01-01' })}`
		);
	});

	/**
	 * The one asymmetry this source does share with Spotify.
	 *
	 * `seekToTime` needs a `nowPlayingItem`, which does not exist until playback
	 * has started — so a restored position is spent as the queue's `startTime`
	 * rather than as a seek, and a seek issued before the first press is only
	 * remembered.
	 */
	it('spends a restored position on the queue rather than on a seek', async () => {
		const { instance } = stubMusic();
		const { source } = build(instance);

		await source.load(songId, 92);

		expect(instance.setQueue).toHaveBeenCalledWith(expect.objectContaining({ startTime: 92 }));
		expect(instance.seekToTime).not.toHaveBeenCalled();
		expect(source.time).toBe(92);

		source.seek(30);
		expect(instance.seekToTime).not.toHaveBeenCalled();
		expect(source.time).toBe(30);
	});

	/**
	 * The other direction of the same asymmetry, and the one a reloaded draft
	 * actually meets: the reconnect press builds the queue around the restored
	 * position, and a lyric line tapped while that load settles is a seek with
	 * nowhere to land. Remembered but never spent, the readout said the tapped
	 * line while the audio started wherever the queue pointed — so the first
	 * play rebuilds the queue around the remembered position before starting.
	 */
	it('spends a pre-start seek on the first play by rebuilding the queue', async () => {
		const { instance } = stubMusic();
		const { source } = build(instance);

		await source.load(songId, 92);
		source.seek(30);

		source.play();
		await vi.waitFor(() => expect(instance.play).toHaveBeenCalled());

		expect(instance.setQueue).toHaveBeenLastCalledWith(
			expect.objectContaining({ song: songId, startPlaying: false, startTime: 30 })
		);
		expect(instance.seekToTime).not.toHaveBeenCalled();
		expect(source.time).toBe(30);
	});

	// The rebuild is owed only where a seek moved the position: an untouched
	// first press must stay one `play()`, not a queue round trip in front of it.
	it('plays without re-queueing when nothing moved the position', async () => {
		const { instance } = stubMusic();
		const { source } = build(instance);

		await source.load(songId, 92);
		source.play();
		await vi.waitFor(() => expect(instance.play).toHaveBeenCalled());

		expect(instance.setQueue).toHaveBeenCalledTimes(1);
	});

	it('seeks for real once playback has started', async () => {
		const { instance, emit } = stubMusic();
		const { source } = build(instance);

		await source.load(songId);
		emit('playbackStateDidChange', { state: playbackStates.playing });
		source.seek(30);

		expect(instance.seekToTime).toHaveBeenCalledWith(30);
	});

	/**
	 * The gap `seekToTime` opens, which the readout must never show.
	 *
	 * MusicKit answers a seek with one or more time events still carrying the
	 * position the user just left, so a nudge used to read as current, target,
	 * previous, and only then the new time.
	 */
	it('holds a seek target until the player agrees', async () => {
		const { instance, emit } = stubMusic();
		const { source, events } = build(instance);

		await source.load(songId);
		emit('playbackStateDidChange', { state: playbackStates.playing });

		source.seek(38);
		expect(source.time).toBe(38);

		// The stale one, from before the seek landed.
		emit('playbackTimeDidChange', { currentPlaybackTime: 40 });
		expect(source.time).toBe(38);
		expect(events.log).not.toContain('time:40');

		emit('playbackTimeDidChange', { currentPlaybackTime: 38.2 });
		expect(source.time).toBe(38.2);
	});

	// The reported flash: skipping forward showed the target, dropped back to the
	// line the skip started on, then went forward again. MusicKit emits a burst of
	// stale events all carrying the pre-seek position, and an event tally alone
	// spent its whole budget on that burst and released the hold before the seek
	// had landed. The burst must be held through, however long it runs.
	it('holds the target through the whole stale burst without flashing back', async () => {
		const { instance, emit } = stubMusic();
		const { source, events } = build(instance);

		await source.load(songId);
		emit('playbackStateDidChange', { state: playbackStates.playing });

		// A real playback position — where the skip starts from.
		emit('playbackTimeDidChange', { currentPlaybackTime: 50 });
		expect(source.time).toBe(50);
		const settledLog = events.log.length;

		// Skip forward; the readout jumps to the target at once.
		source.seek(70);
		expect(source.time).toBe(70);

		// The stale burst — more events than the give-up backstop — all carrying
		// the position the skip started from. The readout must not drop back to it.
		for (let index = 0; index < settleMaxEvents + 3; index += 1) {
			emit('playbackTimeDidChange', { currentPlaybackTime: 50 });
			expect(source.time).toBe(70);
		}

		// Then the seek lands, and the player's own time takes over.
		emit('playbackTimeDidChange', { currentPlaybackTime: 70 });
		expect(source.time).toBe(70);
		// Nothing after the skip ever reported the position it started from.
		expect(events.log.slice(settledLog)).not.toContain('time:50');
	});

	// A seek the player never carries out must not strand the readout on a
	// position nothing is playing from.
	it('gives up a seek target that never lands', async () => {
		const { instance, emit } = stubMusic();
		const { source } = build(instance);

		await source.load(songId);
		emit('playbackStateDidChange', { state: playbackStates.playing });
		source.seek(38);

		for (let index = 0; index < 4; index += 1) {
			emit('playbackTimeDidChange', { currentPlaybackTime: 60 + index });
		}

		expect(source.time).toBe(63);
	});

	// No poll anywhere in this file, unlike the other two remote sources: MusicKit
	// reports the playhead itself, so the transport is fed by events.
	it('reports the playhead from the player’s own event', async () => {
		const { instance, emit } = stubMusic();
		const { source, events } = build(instance);

		await source.load(songId);
		emit('playbackTimeDidChange', { currentPlaybackTime: 41.5, currentPlaybackDuration: 223 });

		expect(source.time).toBe(41.5);
		expect(events.log).toContain('time:41.5');
	});

	/**
	 * `time` is a reading, not a memory — and `liveTime()` is what a sync tap
	 * stamps.
	 *
	 * Answered from the last `playbackTimeDidChange`, it was the same stale number
	 * the mirror already held, so every anchor a run wrote was early by however
	 * long had passed since that event — a different amount on every tap. On
	 * playback that is a wash leading the vocal by a distance that changes line to
	 * line, which is how it was reported.
	 */
	it('reads the playhead live between time events', async () => {
		const { instance, emit, advance } = stubMusic();
		const { source } = build(instance);

		await source.load(songId);
		emit('playbackStateDidChange', { state: playbackStates.playing });
		emit('playbackTimeDidChange', { currentPlaybackTime: 41.5 });

		// The song runs on and MusicKit says nothing until its next announcement.
		advance(42.3);

		expect(source.time).toBe(42.3);
	});

	/**
	 * Before the first press there is no `nowPlayingItem` for the property to
	 * describe, so it reads 0 while the restored position is what the queue was
	 * built around — the same distinction `seek` makes, which is why the live read
	 * sits behind `started` too. Without that guard a reopened draft reports 0:00
	 * until something presses play.
	 */
	it('reports the restored position until playback starts', async () => {
		const { instance } = stubMusic();
		const { source } = build(instance);

		await source.load(songId, 64);

		expect(source.time).toBe(64);
	});

	it('translates MusicKit’s state numbers into the transport’s events', async () => {
		const { instance, emit } = stubMusic();
		const { source, events } = build(instance);
		await source.load(songId);

		emit('playbackStateDidChange', { state: playbackStates.playing });
		emit('playbackStateDidChange', { state: playbackStates.paused });
		emit('playbackStateDidChange', { state: playbackStates.completed });

		expect(events.log).toContain('started');
		expect(events.log).toContain('stopped');
		expect(events.log).toContain('ended');
	});

	it('reports rejected play and seek presses, and settles a rejected stop', async () => {
		const { instance, emit } = stubMusic({
			play: vi.fn(async () => Promise.reject(new Error('subscription lapsed'))),
			seekToTime: vi.fn(async () => Promise.reject(new Error('drm failed'))),
			stop: vi.fn(async () => Promise.reject(new Error('transfer failed')))
		});
		const { source, events } = build(instance);
		await source.load(songId);
		emit('playbackStateDidChange', { state: playbackStates.playing });

		source.play();
		source.seek(30);
		source.clear();
		await vi.waitFor(() => {
			expect(events.log).toContain('failed:Apple Music could not play that song.');
			expect(events.log).toContain('stopped');
		});
	});

	// A subscriber who is already signed in from a previous session must not be
	// sent through Apple's window again — MusicKit keeps its own user token, and
	// this is the same trade the file source makes with an already-granted
	// permission.
	it('does not ask for a sign-in it already has', async () => {
		const { instance } = stubMusic();
		const { source } = build(instance);

		await source.load(songId);

		expect(instance.authorize).not.toHaveBeenCalled();
	});

	it('signs in first where there is no session, and gives up quietly on a refusal', async () => {
		const { instance } = stubMusic({
			isAuthorized: false,
			authorize: vi.fn(async () => {
				throw new Error('cancelled');
			})
		});
		const { source, events } = build(instance);

		await source.load(songId);

		expect(events.log).toContain('failed:Apple Music sign-in was cancelled.');
		expect(instance.setQueue).not.toHaveBeenCalled();
	});

	/**
	 * A queue built for the song the user has already moved off says nothing, and
	 * claims nothing.
	 *
	 * `load` checks staleness after the instance and after the sign-in, and did
	 * not after the queue — which is the longest await of the three. So a refused
	 * queue for the outgoing song put `Apple Music would not queue that song.` on
	 * a strip that had just attached a different one, and a queue that *succeeded*
	 * late stamped `queuedAt` with the outgoing song's start time. That second one
	 * is the quieter half: the next play then found `known !== queuedAt`, rebuilt
	 * the queue nobody asked it to, and started the song a second time.
	 */
	it('says nothing when a superseded queue is refused', async () => {
		const queues = deferredQueues();
		const { instance } = stubMusic({ setQueue: queues.setQueue });
		const { source, events } = build(instance);

		void source.load(songId);
		await vi.waitFor(() => expect(queues.pending()).toBe(1));
		void source.load(otherSongId);
		await vi.waitFor(() => expect(queues.pending()).toBe(2));

		queues.reject(0, new Error('no such song'));
		await settle();

		expect(events.log.some((entry) => entry.startsWith('failed:'))).toBe(false);
	});

	it('leaves the bookkeeping to whichever song is attached now', async () => {
		const queues = deferredQueues();
		const { instance } = stubMusic({ setQueue: queues.setQueue });
		const { source } = build(instance);

		// The first song is being reopened where it was left; the second starts
		// from the top, so a `queuedAt` carried over from the first would disagree
		// with `known` and send the next press through a queue rebuild.
		void source.load(songId, 90);
		await vi.waitFor(() => expect(queues.pending()).toBe(1));
		void source.load(otherSongId);
		await vi.waitFor(() => expect(queues.pending()).toBe(2));

		queues.resolve(1);
		queues.resolve(0);
		await settle();

		source.play();
		await settle();

		// Two queues: one per load, and no rebuild behind the press.
		expect(queues.calls()).toHaveLength(2);
		expect(instance.play).toHaveBeenCalled();
	});

	/**
	 * The playback-error listener comes off with the other two.
	 *
	 * The instance is a page singleton, so an anonymous listener added to it is one
	 * no teardown can ever reach: a source destroyed and replaced left the old one
	 * reporting into a transport that had been thrown away.
	 */
	it('gives up its playback-error listener when the source is destroyed', async () => {
		const music = stubMusic();
		const { source, events } = build(music.instance);
		await source.load(songId);

		music.emit('mediaPlaybackError', {});
		expect(events.log).toContain('failed:Apple Music could not play that song.');

		source.destroy();
		const before = events.log.length;
		music.emit('mediaPlaybackError', {});
		expect(events.log).toHaveLength(before);
	});

	/**
	 * The regression this whole wrapper exists for, at the level that matters.
	 *
	 * A blocked pop-up leaves MusicKit's own `authorize()` unsettled forever, so
	 * before this `load` never returned — and `load` not returning is what left
	 * `busy` true, the picker's search button dead, no artwork, and a play control
	 * spinning. What is asserted here is simply that it *resolves*.
	 */
	it('does not hang when the sign-in window is blocked, and says so', async () => {
		const { instance } = stubMusic({
			isAuthorized: false,
			// Exactly MusicKit's own shape: no throw, no resolve, ever.
			authorize: vi.fn(() => new Promise<string>(() => {}))
		});
		const events = recorder();
		const source = createAppleMusicSource({
			events,
			music: async () => instance,
			playbackStates: async () => playbackStates,
			rates: [1],
			authorize: async () => 'blocked'
		});

		await source.load(songId);

		expect(events.log).toContain(
			'failed:Apple Music’s sign-in window was blocked. Allow pop-ups for this site, then press again.'
		);
		expect(instance.setQueue).not.toHaveBeenCalled();
	});
});

describe('authorizeAppleMusic', () => {
	/** A scope standing in for `window`, so nothing here touches a real one. */
	function scopeWith(open: () => unknown) {
		return { open: open as unknown as (typeof globalThis)['open'] };
	}

	/**
	 * The blocked window is *observed*, not waited out.
	 *
	 * MusicKit answers a blocked pop-up with silence — `_startPollingForWindowClosed`
	 * is guarded on the window existing, and that interval is the only thing that
	 * ever settles the promise. So the `null` return from `window.open` is the
	 * signal, and it has to resolve the race while `authorize()` is still pending
	 * for the rest of the page's life.
	 */
	it('answers at once when the pop-up is blocked, without waiting on MusicKit', async () => {
		const scope = scopeWith(() => null);
		const { instance } = stubMusic({
			isAuthorized: false,
			authorize: vi.fn(() => {
				scope.open('https://authorize.music.apple.com/woa', 'apple-auth');
				return new Promise<string>(() => {});
			})
		});

		await expect(authorizeAppleMusic(instance, { scope })).resolves.toBe('blocked');
	});

	it('reports a completed sign-in and one the user turned down', async () => {
		const opened = () => scopeWith(() => ({ closed: false }));

		const { instance: signedIn } = stubMusic({
			isAuthorized: false,
			authorize: vi.fn(async () => 'user-token')
		});
		await expect(authorizeAppleMusic(signedIn, { scope: opened() })).resolves.toBe('authorized');

		const { instance: refused } = stubMusic({
			isAuthorized: false,
			authorize: vi.fn(async () => {
				throw new Error('cancelled');
			})
		});
		await expect(authorizeAppleMusic(refused, { scope: opened() })).resolves.toBe('refused');
	});

	/**
	 * The patch is a watcher, not a replacement.
	 *
	 * It hands MusicKit back whatever the real `window.open` returned — including
	 * the `null` — and puts the original back on every path, so a blocked sign-in
	 * cannot leave the page with a wrapped `open` for everything that comes after.
	 */
	it('passes the window through unchanged and restores open afterwards', async () => {
		const real = vi.fn(() => ({ closed: false }));
		const scope = scopeWith(real);
		const native = scope.open;
		let seen: unknown;
		const { instance } = stubMusic({
			isAuthorized: false,
			authorize: vi.fn(async () => {
				seen = scope.open('https://authorize.music.apple.com/woa', 'apple-auth');
				return 'user-token';
			})
		});

		await authorizeAppleMusic(instance, { scope });

		expect(seen).toEqual({ closed: false });
		expect(real).toHaveBeenCalledTimes(1);
		expect(scope.open).toBe(native);
	});

	/**
	 * The backstop, for a MusicKit that stops using `window.open`.
	 *
	 * It is five minutes in production and deliberately useless as a timeout — a
	 * sign-in is a person typing a password and a code from another device, and
	 * cutting that off partway would be a worse bug than the hang. This only
	 * guarantees the wait is bounded.
	 */
	it('gives up eventually even if nothing ever opens a window', async () => {
		const { instance } = stubMusic({
			isAuthorized: false,
			authorize: vi.fn(() => new Promise<string>(() => {}))
		});

		await expect(
			authorizeAppleMusic(instance, { scope: scopeWith(() => null), timeoutMs: 5 })
		).resolves.toBe('unanswered');
	});
});
