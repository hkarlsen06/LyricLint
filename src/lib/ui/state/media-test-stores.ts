import { createFeedbackState } from './feedback.svelte.js';
import { createMediaPlayer } from './media-player.svelte.js';
import type { MediaPlayer } from './media-player.svelte.js';
import { createMediaStore } from './media-store.svelte.js';
import type { MediaStore } from './media-store.svelte.js';
import { createInMemoryMediaRepository } from './in-memory.js';
import { StubAudio } from './media-test-audio.js';

/**
 * Stores with a catalogue song attached, and nothing reaching a catalogue.
 *
 * Shared because the song's name and its attribution are drawn by two surfaces —
 * the transport strip where there is no cover band, the band's own bar where
 * there is — so both of their test files need the same attached song. A copy per
 * file is how the two would drift into testing different songs.
 */

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
		loadSpotifySdk: async () => ({ Player: class {} }) as never,
		spotifyToken: async () => 'token',
		spotifyRequest: (async () =>
			new Response(JSON.stringify({ name: 'Sensommer', artists: [{ name: 'Mul' }] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})) as typeof fetch,
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
	const player = createMediaPlayer({
		feedback,
		createAudio: () => new StubAudio().asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {},
		loadMusicKit: async () =>
			({
				PlaybackStates: { playing: 2, paused: 3 },
				configure: async () => ({
					isAuthorized: true,
					storefrontId: 'no',
					playbackRate: 1,
					setQueue: async () => undefined,
					addEventListener: () => {},
					removeEventListener: () => {}
				})
			}) as never,
		appleMusicRequest: (async () =>
			new Response(
				JSON.stringify({
					data: [
						{
							attributes: {
								name: 'Stole the Show',
								artistName: 'Kygo',
								...(options.artwork === undefined ? {} : { artwork: { url: options.artwork } })
							}
						}
					]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)) as typeof fetch
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
