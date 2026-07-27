import { describe, expect, it, vi } from 'vitest';
import type { AppleMusicInstance, AppleMusicSource } from './media-apple.js';
import {
	appleMusicConfigured,
	appleMusicTokenExpiry,
	createAppleMusicSource,
	parseAppleMusicSongId,
	searchAppleMusicSongs
} from './media-apple.js';
import type { MediaSourceEvents } from './media-player.svelte.js';

const songId = '1091453645';
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
	return {
		instance,
		emit: (name: string, event: unknown) => listeners.get(name)?.(event as never)
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
				artwork: { url: 'https://is1-ssl.mzstatic.com/image/thumb/x/{w}x{h}bb.jpg' }
			}
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

	it('seeks for real once playback has started', async () => {
		const { instance, emit } = stubMusic();
		const { source } = build(instance);

		await source.load(songId);
		emit('playbackStateDidChange', { state: playbackStates.playing });
		source.seek(30);

		expect(instance.seekToTime).toHaveBeenCalledWith(30);
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
});
