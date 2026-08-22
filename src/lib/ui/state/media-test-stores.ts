import { createFeedbackState } from './feedback.svelte.js';
import { createMediaPlayer } from './media-player.svelte.js';
import type { MediaPlayer } from './media-player.svelte.js';
import { createMediaStore } from './media-store.svelte.js';
import type { MediaStore } from './media-store.svelte.js';
import { createInMemoryMediaRepository } from './in-memory.js';
import { StubAudio } from './media-test-audio.js';
import type { AppleMusicInstance } from './media-apple.js';
import type { SpotifyPlaybackState, SpotifyPlayerLike, SpotifySdk } from './media-spotify.js';

/**
 * Stores with a catalogue song attached, and nothing reaching a catalogue.
 *
 * Shared because the song's name and its attribution are drawn by two surfaces —
 * the transport strip where there is no cover band, the band's own bar where
 * there is — so both of their test files need the same attached song. A copy per
 * file is how the two would drift into testing different songs.
 */

/**
 * A Spotify player that refuses at the first call.
 *
 * Deliberately not a working double. A player that answered `connect()` honestly
 * would make every one of these stores wait out the twenty-second device
 * registration, and one that answered it with `false` would report a failure
 * that never happened — so this throws instead, which is what the source already
 * treats as no player being here: `connect()` rejects, `load` tears down, and
 * nothing is reported. Attaching is silent by design, so the name and the mark
 * are in place before a device would have been either way.
 */
class RefusedSpotifyPlayer implements SpotifyPlayerLike {
	private refuse(): never {
		throw new Error('This stub has no Spotify player behind it.');
	}
	connect(): Promise<boolean> {
		return this.refuse();
	}
	disconnect(): void {
		this.refuse();
	}
	addListener(): boolean {
		return this.refuse();
	}
	getCurrentState(): Promise<SpotifyPlaybackState | null> {
		return this.refuse();
	}
	pause(): Promise<void> {
		return this.refuse();
	}
	resume(): Promise<void> {
		return this.refuse();
	}
	seek(): Promise<void> {
		return this.refuse();
	}
}

const silentSpotifySdk: SpotifySdk = { Player: RefusedSpotifyPlayer };

/**
 * A Spotify track on the transport.
 *
 * The SDK is a stub whose device never arrives, which is enough: attaching is
 * silent by design, so the name and the link are in place before any player is.
 */
export async function spotifyStore(): Promise<{ media: MediaStore; player: MediaPlayer }> {
	const feedback = createFeedbackState();
	const player = createMediaPlayer({
		feedback,
		createAudio: () => new StubAudio().asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {},
		loadSpotifySdk: async () => silentSpotifySdk,
		spotifyToken: async () => 'token',
		spotifyRequest: async () =>
			new Response(JSON.stringify({ name: 'Sensommer', artists: [{ name: 'Mul' }] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			}),
		scheduleSpotifyPoll: () => () => {}
	});
	const media = createMediaStore({
		repository: createInMemoryMediaRepository(),
		feedback,
		draftId: () => 'draft-1',
		player
	});
	await media.attachSpotifyTrack('4cOdK2wGLETKBW3PvgPWqT', 'Mul — Sensommer');
	return { media, player };
}

/** The song's half of the catalogue read, as much of it as these stores answer. */
interface AppleSongAttributes {
	name: string;
	artistName: string;
	artwork?: { url: string };
}

/**
 * The same, one source over, and nothing reaching Apple.
 *
 * `artwork` decides whether the cover band has a picture to draw, so it is a
 * parameter: a song mid-attach has none yet, and the band's bar has to be
 * standing either way.
 */
export async function appleStore(
	options: { artwork?: string } = {}
): Promise<{ media: MediaStore; player: MediaPlayer }> {
	const feedback = createFeedbackState();
	// Built a field at a time rather than spread conditionally: a song mid-attach
	// has no artwork at all, which is not the same as an empty one.
	const attributes: AppleSongAttributes = { name: 'Stole the Show', artistName: 'Kygo' };
	if (options.artwork !== undefined) attributes.artwork = { url: options.artwork };
	const player = createMediaPlayer({
		feedback,
		createAudio: () => new StubAudio().asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {},
		// Complete rather than partial, so nothing here has to be asserted into
		// place: what an attach actually reaches is the storefront, the queue and
		// the listeners, and the commands nobody presses answer with nothing.
		loadMusicKit: async () => ({
			PlaybackStates: { playing: 2, paused: 3 },
			configure: async (): Promise<AppleMusicInstance> => ({
				isAuthorized: true,
				storefrontId: 'no',
				currentPlaybackTime: 0,
				currentPlaybackDuration: 0,
				playbackRate: 1,
				authorize: async () => 'stub-user-token',
				setQueue: async () => {},
				play: async () => {},
				pause: () => {},
				stop: async () => {},
				seekToTime: async () => {},
				addEventListener: () => {},
				removeEventListener: () => {}
			})
		}),
		appleMusicRequest: async () =>
			new Response(JSON.stringify({ data: [{ attributes }] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})
	});
	const media = createMediaStore({
		repository: createInMemoryMediaRepository(),
		feedback,
		draftId: () => 'draft-1',
		player
	});
	await media.attachAppleMusicSong('1091453645', 'Kygo — Stole the Show');
	return { media, player };
}
