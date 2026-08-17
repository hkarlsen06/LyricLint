import { describe, expect, it, vi } from 'vitest';
import { createFeedbackState } from './feedback.svelte.js';
import { createInMemoryMediaRepository } from './in-memory.js';
import { createMediaPlayer } from './media-player.svelte.js';
import { createMediaStore } from './media-store.svelte.js';
import { StubAudio } from './media-test-audio.js';
import { createStubYouTubeApi } from './media-test-youtube.js';
import type { MediaRepository } from '$lib/persistence/index.js';
import type { MusicKitLoader } from './media-apple.js';
import { musicKitLoadTimeoutMs, resetAppleMusic } from './media-apple.js';
import { spotifySdkLoadTimeoutMs } from './media-spotify.js';

/**
 * The two halves of the sign-in this suite cannot actually run.
 *
 * `beginSpotifySignIn` ends in `location.assign`, which in a test is the runner
 * navigating away; `spotifyRedirectAllowed` reads a `location` the node half of
 * the suite does not have. Everything else in the module is the real thing, so
 * the parser, the configured check and the token store are all untouched.
 */
const spotifyFlow = vi.hoisted(() => ({ signedIn: false, leaves: true }));

vi.mock('./spotify-auth.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./spotify-auth.js')>();
	return {
		...actual,
		spotifySignedIn: () => spotifyFlow.signedIn,
		spotifyRedirectAllowed: () => true,
		beginSpotifySignIn: async () => spotifyFlow.leaves
	};
});

/**
 * A file handle whose permission answer the test chooses.
 *
 * The browser is the only thing that can mint a real one, so what is under test
 * is the branch the store takes on each answer, not the API itself.
 */
function fakeHandle(
	file: File,
	permission: 'granted' | 'prompt',
	requested: 'granted' | 'denied' = 'granted'
) {
	return {
		kind: 'file' as const,
		name: file.name,
		async queryPermission() {
			return permission;
		},
		async requestPermission() {
			return requested;
		},
		async getFile() {
			return file;
		}
	} as unknown as FileSystemFileHandle;
}

function setup(
	options: {
		repository?: MediaRepository;
		draftId?: () => string;
		now?: () => number;
		file?: File;
		handle?: FileSystemFileHandle;
		loadMusicKit?: MusicKitLoader;
		onTitleSuggestion?: (title: string) => void;
		/** A Spotify SDK that never registers a device, so nothing reaches Spotify. */
		spotify?: boolean;
	} = {}
) {
	const audio = new StubAudio();
	const feedback = createFeedbackState();
	// The stub API is what makes "nothing has contacted Google" an assertion: its
	// `loads` count is the number of times the real loader would have injected a
	// script tag, and no test here mounts a frame for it to draw into.
	const youtube = createStubYouTubeApi();
	const player = createMediaPlayer({
		feedback,
		createAudio: () => audio.asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {},
		loadYouTubeApi: youtube.load,
		...(options.loadMusicKit ? { loadMusicKit: options.loadMusicKit } : {}),
		...(options.spotify
			? {
					// A `Player` with no listeners on it: `connect` throws, the load
					// gives up, and the attachment still runs its bookkeeping — which is
					// the half these tests are about.
					loadSpotifySdk: async () => ({ Player: class {} }) as never,
					spotifyToken: async () => 'token',
					spotifyRequest: (async () => new Response(null, { status: 204 })) as typeof fetch,
					scheduleSpotifyPoll: () => () => {}
				}
			: {})
	});
	const file = options.file ?? new File([''], 'track.mp3', { type: 'audio/mpeg' });
	const repository = options.repository ?? createInMemoryMediaRepository();
	const media = createMediaStore({
		repository,
		feedback,
		draftId: options.draftId ?? (() => 'draft-1'),
		player,
		pickFile: async () => ({ file, handle: options.handle }),
		clock: options.now ?? (() => 0),
		...(options.onTitleSuggestion ? { onTitleSuggestion: options.onTitleSuggestion } : {})
	});

	return { audio, feedback, file, media, player, repository, youtube };
}

describe('media store across sessions', () => {
	it('reopens the track and its playhead when permission is already granted', async () => {
		const repository = createInMemoryMediaRepository();
		const file = new File([''], 'sensommer.mp3', { type: 'audio/mpeg' });
		await repository.attach({
			draftId: 'draft-1',
			name: 'sensommer.mp3',
			handle: fakeHandle(file, 'granted'),
			position: 143
		});

		const { audio, media, player } = setup({ repository });
		await media.openFor('draft-1');

		expect(player.attached).toBe(true);
		expect(media.pendingName).toBeUndefined();
		expect(player.currentTime).toBe(143);

		audio.setDuration(200);
		expect(audio.currentTime).toBe(143);
	});

	// A reload is not a user gesture, so the browser will not hand the bytes back
	// on its own. The draft says which file it wants and waits to be asked.
	it('waits to be asked when the handle still needs a gesture, keeping the position', async () => {
		const repository = createInMemoryMediaRepository();
		const file = new File([''], 'sensommer.mp3', { type: 'audio/mpeg' });
		await repository.attach({
			draftId: 'draft-1',
			name: 'sensommer.mp3',
			handle: fakeHandle(file, 'prompt'),
			position: 143
		});

		const { audio, media, player } = setup({ repository });
		await media.openFor('draft-1');

		expect(player.attached).toBe(false);
		expect(media.pendingName).toBe('sensommer.mp3');

		await media.reconnect();

		expect(player.attached).toBe(true);
		expect(player.currentTime).toBe(143);
		audio.setDuration(200);
		expect(audio.currentTime).toBe(143);
	});

	// Firefox and Safari have no picker API, so there is no handle to store. The
	// name and the position still survive; only the file has to be chosen again.
	it('remembers the position with no handle to reopen', async () => {
		const repository = createInMemoryMediaRepository();
		await repository.attach({ draftId: 'draft-1', name: 'track.mp3', position: 61 });

		const { media, player } = setup({ repository });
		await media.openFor('draft-1');
		expect(media.pendingName).toBe('track.mp3');

		await media.reconnect();

		expect(player.attached).toBe(true);
		expect(player.currentTime).toBe(61);
	});

	/**
	 * And the re-pick writes that position back down, which it did not.
	 *
	 * `remember` used to read `pendingPosition` off the module, and every caller
	 * runs `adopt()` first — which clears it. So the record was rewritten with no
	 * position at all, and `flushPosition`'s dedup then refused to repair it,
	 * because `claim` had already recorded 90 as the last number written. On a
	 * browser with no picker API this branch *is* the reconnect: reopen a draft,
	 * pick the file again, close the tab without pressing play, and the playhead
	 * was gone.
	 */
	it('writes the restored playhead back down when the file is picked again', async () => {
		const repository = createInMemoryMediaRepository();
		await repository.attach({ draftId: 'draft-1', name: 'track.mp3', position: 90 });

		const { audio, media } = setup({ repository });
		await media.openFor('draft-1');
		await media.reconnect();

		expect((await repository.get('draft-1'))?.position).toBe(90);

		// The dedup guard is the second half of it: `claim` records 90 as the last
		// number written, so nothing else was ever going to put it back.
		audio.setDuration(200);
		await media.flushPosition();
		expect((await repository.get('draft-1'))?.position).toBe(90);
	});

	it('writes the playhead down when playback settles', async () => {
		const { audio, media, repository } = setup();
		await media.attachFile(new File([''], 'track.mp3'));
		audio.setDuration(200);

		media.player.play();
		audio.currentTime = 88;
		media.player.pause();
		await Promise.resolve();

		expect((await repository.get('draft-1'))?.position).toBe(88);
	});

	it('throttles a moving playhead instead of writing on every tick', async () => {
		let now = 0;
		const { audio, media, repository } = setup({ now: () => now });
		await media.attachFile(new File([''], 'track.mp3'));
		audio.setDuration(600);

		media.player.play();
		for (const time of [1, 2, 3, 4]) {
			now += 1000;
			audio.currentTime = time;
			audio.dispatchEvent(new Event('timeupdate'));
		}
		await Promise.resolve();
		expect((await repository.get('draft-1'))?.position).toBeUndefined();

		now += 2000;
		audio.currentTime = 6;
		audio.dispatchEvent(new Event('timeupdate'));
		await Promise.resolve();
		expect((await repository.get('draft-1'))?.position).toBe(6);
	});

	// The clock never advances here, so the throttle would suppress every write:
	// what is under test is that the flush ignores it.
	it('flushes the playhead on demand, for the tab being hidden', async () => {
		const { audio, media, repository } = setup();
		await media.attachFile(new File([''], 'track.mp3'));
		audio.setDuration(600);

		media.player.play();
		audio.currentTime = 12;
		audio.dispatchEvent(new Event('timeupdate'));
		expect((await repository.get('draft-1'))?.position).toBeUndefined();

		await media.flushPosition();
		expect((await repository.get('draft-1'))?.position).toBe(12);
	});

	// Switching drafts while audio runs must not stamp the outgoing track's
	// playhead onto the draft being opened.
	it('writes a position against the draft the audio belongs to, not the one being opened', async () => {
		const repository = createInMemoryMediaRepository();
		await repository.attach({ draftId: 'draft-2', name: 'other.mp3', position: 5 });

		let draftId = 'draft-1';
		const { audio, media } = setup({ repository, draftId: () => draftId });
		await media.attachFile(new File([''], 'track.mp3'));
		audio.setDuration(600);
		media.player.play();
		audio.currentTime = 77;

		draftId = 'draft-2';
		await media.openFor('draft-2');

		expect((await repository.get('draft-1'))?.position).toBe(77);
		expect((await repository.get('draft-2'))?.position).toBe(5);
	});

	it('keeps the newer draft when two opens interleave', async () => {
		const base = createInMemoryMediaRepository([
			{ draftId: 'draft-1', name: 'older.mp3', attachedAt: '2020-01-01T00:00:00.000Z' },
			{ draftId: 'draft-2', name: 'newer.mp3', attachedAt: '2020-01-01T00:00:00.000Z' }
		]);
		let releaseOlder = (): void => {};
		const olderGate = new Promise<void>((resolve) => {
			releaseOlder = resolve;
		});
		const repository: MediaRepository = {
			...base,
			async get(draftId) {
				if (draftId === 'draft-1') await olderGate;
				return base.get(draftId);
			}
		};
		const { media } = setup({ repository });

		const older = media.openFor('draft-1');
		await Promise.resolve();
		const newer = media.openFor('draft-2');
		await newer;
		releaseOlder();
		await older;

		expect(media.pendingName).toBe('newer.mp3');
	});

	it('keeps a local file record saying so, so nothing has to guess later', async () => {
		const { media, repository } = setup();
		await media.attachFile(new File([''], 'track.mp3'));

		const record = await repository.get('draft-1');
		expect(record?.source).toBe('file');
		expect(record?.videoId).toBeUndefined();
	});

	// Records written before YouTube existed carry no `source` at all, and the
	// live `version(2)` table is full of them. Absence has to read as a file, or a
	// draft attached last week comes back asking to load Google's player.
	it('reads a record with no source at all as a local file', async () => {
		const repository = createInMemoryMediaRepository();
		await repository.attach({ draftId: 'draft-1', name: 'sensommer.mp3', position: 12 });

		const { media } = setup({ repository });
		await media.openFor('draft-1');

		expect(media.pendingSource).toBe('file');
		expect(media.pendingName).toBe('sensommer.mp3');
	});

	it('forgets the position along with the file when the audio is detached', async () => {
		const { audio, media, repository } = setup();
		await media.attachFile(new File([''], 'track.mp3'));
		audio.setDuration(200);
		media.player.play();
		audio.currentTime = 44;

		await media.detach();

		expect(await repository.get('draft-1')).toBeUndefined();
		expect(media.player.attached).toBe(false);
	});

	/**
	 * A refusal owes both channels.
	 *
	 * `announce` writes to an `sr-only` live region and nothing else, so a
	 * declined permission was reported to a screen reader and to nobody else: the
	 * press landed, the row did not change, and nothing on screen said the
	 * workbench had answered at all. The toast region is not a live region, so
	 * neither one alone is enough.
	 */
	it('says a declined permission on screen as well as to a screen reader', async () => {
		const repository = createInMemoryMediaRepository();
		const file = new File([''], 'sensommer.mp3');
		await repository.attach({
			draftId: 'draft-1',
			name: 'sensommer.mp3',
			handle: fakeHandle(file, 'prompt', 'denied')
		});

		const { feedback, media } = setup({ repository });
		await media.openFor('draft-1');
		await media.reconnect();

		const refusal = 'Permission to read that audio file was declined.';
		expect(media.player.attached).toBe(false);
		expect(feedback.announcement).toBe(refusal);
		expect(feedback.toasts.map((toast) => toast.message)).toEqual([refusal]);
	});

	/**
	 * The one storage failure this store used to swallow. Silent, a draft that has
	 * audio opens with no strip, no pending row and no explanation — which reads
	 * as the attachment having been thrown away rather than as a read that failed.
	 */
	it('says so when the remembered audio cannot be read back at all', async () => {
		const repository = {
			...createInMemoryMediaRepository(),
			get: async () => {
				throw new Error('storage unavailable');
			}
		};

		const { feedback, media } = setup({ repository });
		await media.openFor('draft-1');

		expect(media.pendingName).toBeUndefined();
		expect(feedback.announcement).toContain('could not be read from local storage');
		expect(feedback.toasts).toHaveLength(1);
	});
});

describe('the YouTube opt-in', () => {
	// The gate, and the only thing between a page load and a request to Google.
	it('loads nothing from Google until a press asks it to', async () => {
		const repository = createInMemoryMediaRepository();
		await repository.attach({
			draftId: 'draft-1',
			name: 'youtu.be/dQw4w9WgXcQ',
			source: 'youtube',
			videoId: 'dQw4w9WgXcQ',
			position: 143
		});

		const { media, player, youtube } = setup({ repository });
		await media.openFor('draft-1');

		expect(youtube.loads).toBe(0);
		expect(media.youtubeAllowed).toBe(false);
		expect(player.attached).toBe(false);
		// The draft says what it wants, and which of the two questions it is.
		expect(media.pendingName).toBe('youtu.be/dQw4w9WgXcQ');
		expect(media.pendingSource).toBe('youtube');

		await media.reconnect();

		expect(youtube.loads).toBe(1);
		expect(media.youtubeAllowed).toBe(true);
		expect(player.attached).toBe(true);
		expect(player.sourceKind).toBe('youtube');
		expect(player.currentTime).toBe(143);
	});

	// Once in a session is once. Having said yes, a user switching between drafts
	// is not asked again — the same trade the file path makes with a permission
	// the browser has already granted.
	it('opens the next video without asking a second time', async () => {
		const repository = createInMemoryMediaRepository();
		await repository.attach({
			draftId: 'draft-2',
			name: 'youtu.be/aaaaaaaaaaa',
			source: 'youtube',
			videoId: 'aaaaaaaaaaa'
		});

		let draftId = 'draft-1';
		const { media, player, youtube } = setup({ repository, draftId: () => draftId });
		expect(await media.attachYouTube('https://youtu.be/dQw4w9WgXcQ')).toBeUndefined();

		draftId = 'draft-2';
		await media.openFor('draft-2');

		expect(player.attached).toBe(true);
		expect(media.pendingName).toBeUndefined();
		expect(media.pendingSource).toBeUndefined();
		expect(youtube.loads).toBeGreaterThan(0);
	});

	it('answers a link that is not one with a message and grants nothing', async () => {
		const { media, player, repository, youtube } = setup();

		expect(await media.attachYouTube('https://vimeo.com/12345')).toBe(
			'That is not a YouTube link.'
		);

		expect(youtube.loads).toBe(0);
		expect(media.youtubeAllowed).toBe(false);
		expect(player.attached).toBe(false);
		expect(await repository.get('draft-1')).toBeUndefined();
	});

	it('remembers a video as an id rather than as a file', async () => {
		const { media, repository } = setup();

		await media.attachYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s');

		const record = await repository.get('draft-1');
		expect(record?.source).toBe('youtube');
		expect(record?.videoId).toBe('dQw4w9WgXcQ');
		expect(record?.name).toBe('youtu.be/dQw4w9WgXcQ');
		expect(record?.handle).toBeUndefined();
	});

	// The playhead is the same durable fact whichever source it belongs to, and
	// the write path is the same one — the transport reports, the store writes.
	it('remembers where a video was left, the way it remembers a file', async () => {
		const { media, repository } = setup();
		await media.attachYouTube('https://youtu.be/dQw4w9WgXcQ');

		media.player.seek(88);
		await media.flushPosition();

		expect((await repository.get('draft-1'))?.position).toBe(88);
	});

	// A video is an id until Google's player answers with a title. The transport
	// reports that the way it reports a position; this is the leg after it, and
	// the rest of the record has to survive the rename.
	it('renames a remembered video without losing what it points at', async () => {
		const { media, repository } = setup();
		await media.attachYouTube('https://youtu.be/dQw4w9WgXcQ');

		await repository.saveName('draft-1', 'Sensommer');

		const record = await repository.get('draft-1');
		expect(record?.name).toBe('Sensommer');
		expect(record?.videoId).toBe('dQw4w9WgXcQ');
		expect(record?.source).toBe('youtube');
	});

	it('detaching a video forgets the id with it', async () => {
		const { media, repository } = setup();
		await media.attachYouTube('https://youtu.be/dQw4w9WgXcQ');

		await media.detach();

		expect(await repository.get('draft-1')).toBeUndefined();
		expect(media.player.attached).toBe(false);
		expect(media.player.sourceKind).toBeUndefined();
	});
});

describe('a draft on a Spotify track', () => {
	// The symptom this pins: a reload came back with no audio and no sign there
	// had been any — not even the pending bar that says which track it wants.
	it('comes back as a pending track after a reload', async () => {
		const repository = createInMemoryMediaRepository();
		const { media } = setup({ repository });

		await media.attachSpotifyTrack('4cOdK2wGLETKBW3PvgPWqT', 'Mul — Sensommer');
		expect(media.trackId).toBe('4cOdK2wGLETKBW3PvgPWqT');

		// A reload is a fresh store over the same storage.
		const next = setup({ repository });
		await next.media.openFor('draft-1');

		expect(next.media.pendingName).toBe('Mul — Sensommer');
		expect(next.media.pendingSource).toBe('spotify');
		expect(next.media.trackId).toBe('4cOdK2wGLETKBW3PvgPWqT');
		// Not signed in, so nothing has been loaded — the press is what pays.
		expect(next.player.attached).toBe(false);
	});

	/**
	 * The sign-in round trip, and what it used to cost.
	 *
	 * `resumeSignIn` comes back holding the link and nothing else, so the attach
	 * behind it named the record after the URL and wrote no position at all — the
	 * draft lost the title Spotify had already given it and reopened at 0:00. The
	 * pending record is this same track's, so both are already in hand; they only
	 * had to be read before `adoptTrack` cleared them.
	 */
	it('keeps the remembered title and playhead when the same track attaches again', async () => {
		const trackId = '4cOdK2wGLETKBW3PvgPWqT';
		const repository = createInMemoryMediaRepository();
		await repository.attach({
			draftId: 'draft-1',
			name: 'Mul — Sensommer',
			source: 'spotify',
			trackId,
			position: 90
		});

		const { media, player, repository: store } = setup({ repository, spotify: true });
		await media.openFor('draft-1');
		expect(media.pendingName).toBe('Mul — Sensommer');

		// What the sign-in hands back: the provisional name minted from the link.
		await media.attachSpotifyTrack(trackId, `open.spotify.com/track/${trackId}`);

		const record = await store.get('draft-1');
		expect(record?.name).toBe('Mul — Sensommer');
		expect(record?.position).toBe(90);
		expect(player.currentTime).toBe(90);
	});

	/**
	 * A press on a link while signed out leaves for the authorize screen, and
	 * `attachSpotify` answers `undefined` for that exactly as it does for a landed
	 * attach. Mapped to an empty result set, the picker rendered `No matches on
	 * Spotify.` over a valid track link for the whole of the navigation.
	 */
	it('reports a departing sign-in rather than an empty catalogue', async () => {
		spotifyFlow.signedIn = false;
		const { media } = setup();

		const outcome = await media.searchSpotify(
			'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'
		);

		expect(outcome).toEqual({ signingIn: true });
	});
});

describe('a draft on an Apple Music song', () => {
	/**
	 * The same reload, with one deliberate difference from Spotify's.
	 *
	 * Spotify can restore silently where this session already holds a token,
	 * because that question is one `sessionStorage` read. Apple's is not: whether
	 * MusicKit still has a user token can only be answered by loading Apple's
	 * script, which is the exact thing a page nobody has touched must not do. So a
	 * song is *always* pending, and the press pays for the script and the sign-in
	 * together.
	 */
	it('comes back as a pending song after a reload, and loads nothing on its own', async () => {
		const repository = createInMemoryMediaRepository();
		const { media } = setup({ repository });

		await media.attachAppleMusicSong('1091453645', 'Kygo — Stole the Show');
		expect(media.songId).toBe('1091453645');

		const next = setup({ repository });
		await next.media.openFor('draft-1');

		expect(next.media.pendingName).toBe('Kygo — Stole the Show');
		expect(next.media.pendingSource).toBe('apple');
		expect(next.media.songId).toBe('1091453645');
		expect(next.player.attached).toBe(false);
	});

	/**
	 * The bug this pair of tests was written for, and why it presented as three.
	 *
	 * A blocked sign-in pop-up leaves MusicKit's `authorize()` unsettled forever
	 * (see `authorizeAppleMusic`), so `reconnect` never reached its `finally` and
	 * `busy` stayed true for the rest of the session. Nothing about that looks like
	 * a sign-in problem from the outside: the reconnect control span forever, no
	 * artwork ever arrived, and — three surfaces away — the picker's search button
	 * is disabled on `busy`, so Apple Music search read as broken in a dialog the
	 * user had not even had open when it happened.
	 *
	 * So the assertion is `busy`, not the message. A press that fails has to hand
	 * the workbench back.
	 */
	it('hands the workbench back when the sign-in window is blocked', async () => {
		const nativeOpen = (globalThis as { open?: unknown }).open;
		// Node has no `window.open`, and its absence means "nothing to watch" rather
		// than "refused" — so a browser that refuses has to be supplied to be tested.
		(globalThis as { open?: unknown }).open = () => null;

		try {
			const repository = createInMemoryMediaRepository();
			await repository.attach({
				draftId: 'draft-1',
				name: 'Kygo — Stole the Show',
				source: 'apple',
				songId: '1091453645'
			});

			const { media, player } = setup({
				repository,
				loadMusicKit: async () => stubMusicKitRefusingSignIn()
			});
			await media.openFor('draft-1');
			expect(media.pendingSource).toBe('apple');

			await media.reconnect();

			expect(media.busy).toBe(false);
			expect(player.starting).toBe(false);
			expect(player.error).toBe(
				'Apple Music’s sign-in window was blocked. Allow pop-ups for this site, then press again.'
			);
		} finally {
			(globalThis as { open?: unknown }).open = nativeOpen;
		}
	});
});

/**
 * MusicKit for a subscriber this origin has never signed in on.
 *
 * `authorize` opens a window and then waits on it, exactly as the real one does —
 * which, when the window was refused, is a promise that never settles.
 */
function stubMusicKitRefusingSignIn() {
	const instance = {
		isAuthorized: false,
		storefrontId: 'no',
		currentPlaybackTime: 0,
		currentPlaybackDuration: 0,
		playbackRate: 1,
		authorize: () => {
			(globalThis as { open?: (url: string, target: string) => unknown }).open?.(
				'https://authorize.music.apple.com/woa',
				'apple-auth'
			);
			return new Promise<string>(() => {});
		},
		setQueue: async () => undefined,
		play: async () => undefined,
		pause: () => {},
		stop: async () => undefined,
		seekToTime: async () => undefined,
		addEventListener: () => {},
		removeEventListener: () => {}
	};
	return {
		configure: async () => instance,
		PlaybackStates: { playing: 2, paused: 3, stopped: 4, ended: 5, completed: 10 }
	} as unknown as Awaited<ReturnType<MusicKitLoader>>;
}

describe('a source pasted with a fragment', () => {
	it('lands as a pending source, persisted for next session, contacting nobody', async () => {
		const titles: string[] = [];
		const { media, player, repository, youtube } = setup({
			onTitleSuggestion: (title) => titles.push(title)
		});

		const taken = await media.adoptPastedSource({
			kind: 'youtube',
			id: 'dQw4w9WgXcQ',
			name: 'Artist — Title'
		});

		expect(taken).toBe(true);
		expect(player.attached).toBe(false);
		expect(youtube.loads).toBe(0);
		expect(media.pendingSource).toBe('youtube');
		expect(media.pendingName).toBe('Artist — Title');
		expect(media.videoId).toBe('dQw4w9WgXcQ');
		expect(titles).toEqual(['Artist — Title']);

		const record = await repository.get('draft-1');
		expect(record?.source).toBe('youtube');
		expect(record?.videoId).toBe('dQw4w9WgXcQ');
		expect(record?.name).toBe('Artist — Title');
	});

	// A copy made before the catalogue answered carries the provisional label,
	// and a draft must never be titled after an address.
	it('does not title the draft after a provisional label', async () => {
		const titles: string[] = [];
		const { media } = setup({ onTitleSuggestion: (title) => titles.push(title) });

		await media.adoptPastedSource({
			kind: 'youtube',
			id: 'dQw4w9WgXcQ',
			name: 'youtu.be/dQw4w9WgXcQ'
		});

		expect(media.pendingName).toBe('youtu.be/dQw4w9WgXcQ');
		expect(titles).toEqual([]);
	});

	it('takes the same no-press shortcut a reload takes once consent exists', async () => {
		const { media, player } = setup();
		// The consent is a press this session already made; letting that video go
		// does not take the consent with it.
		await media.attachYouTube('https://youtu.be/abcdefghijk');
		await media.detach();

		const taken = await media.adoptPastedSource({ kind: 'youtube', id: 'dQw4w9WgXcQ' });

		expect(taken).toBe(true);
		expect(player.attached).toBe(true);
		expect(media.videoId).toBe('dQw4w9WgXcQ');
	});

	/**
	 * An id off a fragment is a string somebody else wrote.
	 *
	 * The clipboard parser caps its length and nothing else looked at it, so a
	 * crafted `data-lyriclint` payload chose the path a request went to: the
	 * Spotify metadata read interpolates the id into a URL that carries this
	 * session's own bearer token, and the attribution link and the video
	 * thumbnail take it just as readily. Each source's own alphabet is the gate,
	 * and a mismatch is refused outright rather than sanitised into something
	 * that would attach the wrong song.
	 */
	it('refuses an id that is not one, contacting nobody and writing nothing', async () => {
		const { media, player, repository, youtube } = setup();

		for (const source of [
			{ kind: 'spotify' as const, id: '../me' },
			{ kind: 'spotify' as const, id: '4cOdK2wGLETKBW3PvgPWq' },
			{ kind: 'youtube' as const, id: '../../watch' },
			{ kind: 'youtube' as const, id: 'dQw4w9WgXcQextra' },
			{ kind: 'apple' as const, id: '1091453645/../../me' },
			{ kind: 'apple' as const, id: 'not-a-number' }
		]) {
			expect(await media.adoptPastedSource(source), source.id).toBe(false);
		}

		expect(player.attached).toBe(false);
		expect(youtube.loads).toBe(0);
		expect(media.pendingSource).toBeUndefined();
		expect(await repository.get('draft-1')).toBeUndefined();
	});

	it('never overwrites audio the draft already has', async () => {
		const { media, player, repository } = setup();
		await media.attach();
		expect(player.attached).toBe(true);

		const taken = await media.adoptPastedSource({ kind: 'apple', id: '1091453645' });

		expect(taken).toBe(false);
		expect((await repository.get('draft-1'))?.source ?? 'file').toBe('file');
	});

	it('leaves a restored record still waiting on its press alone too', async () => {
		const repository = createInMemoryMediaRepository();
		const file = new File([''], 'sensommer.mp3', { type: 'audio/mpeg' });
		await repository.attach({
			draftId: 'draft-1',
			name: 'sensommer.mp3',
			handle: fakeHandle(file, 'prompt')
		});
		const { media } = setup({ repository });
		await media.openFor('draft-1');
		expect(media.pendingName).toBe('sensommer.mp3');

		expect(await media.adoptPastedSource({ kind: 'apple', id: '1091453645' })).toBe(false);
		expect((await repository.get('draft-1'))?.name).toBe('sensommer.mp3');
	});
});

describe('a press made while a reconnect is still waiting', () => {
	/**
	 * Detaching during a permission prompt has to win.
	 *
	 * `reconnect` reads the handle before it awaits, so the continuation held a
	 * reference to audio the user had thrown away in the meantime — and it
	 * attached it, and wrote its record back. The prompt is the window: it is open
	 * for as long as somebody takes to answer a browser dialog, and the row it was
	 * pressed from is still on screen with its Forget control in it.
	 */
	it('abandons the reconnect that a detach has already answered', async () => {
		const repository = createInMemoryMediaRepository();
		const file = new File([''], 'sensommer.mp3', { type: 'audio/mpeg' });
		let answer: ((permission: 'granted') => void) | undefined;
		const handle = {
			kind: 'file' as const,
			name: file.name,
			async queryPermission() {
				return 'prompt' as const;
			},
			requestPermission: async () =>
				await new Promise<'granted'>((resolve) => {
					answer = resolve;
				}),
			async getFile() {
				return file;
			}
		} as unknown as FileSystemFileHandle;

		await repository.attach({ draftId: 'draft-1', name: 'sensommer.mp3', handle });

		const { media, player } = setup({ repository });
		await media.openFor('draft-1');

		const reconnecting = media.reconnect();
		await vi.waitFor(() => expect(answer).toBeDefined());
		await media.detach();
		answer?.('granted');
		await reconnecting;

		expect(player.attached).toBe(false);
		expect(media.pendingName).toBeUndefined();
		expect(await repository.get('draft-1')).toBeUndefined();
	});
});

/**
 * A third-party script that never runs must not take the picker with it.
 *
 * Both loaders resolve on a callback the script makes, so an ad blocker, a
 * content policy or a stalled CDN leaves the promise pending — and with it every
 * `finally` behind it. `busy` is the one that hurts: it is what disables the
 * picker, three surfaces away from the press that hung, which is the same shape
 * of fault a blocked Apple sign-in produced.
 */
describe('a source whose script never answers', () => {
	/** A document whose script tags are appended and then never run. */
	function stubDeadScripts(): void {
		vi.stubGlobal('document', {
			addEventListener: () => {},
			createElement: () => ({ src: '', async: false, addEventListener: () => {} }),
			head: { appendChild: () => {} }
		});
	}

	it('hands the workbench back when MusicKit never loads', async () => {
		vi.useFakeTimers();
		stubDeadScripts();
		resetAppleMusic();
		try {
			const { media, player } = setup();
			const attaching = media.attachAppleMusicSong('1091453645', 'Kygo — Stole the Show');
			expect(media.busy).toBe(true);

			// Still waiting a millisecond short of the timeout, which is what says
			// the timeout is the thing that ends this rather than an early throw.
			await vi.advanceTimersByTimeAsync(musicKitLoadTimeoutMs - 1);
			expect(media.busy).toBe(true);

			await vi.advanceTimersByTimeAsync(1);
			await attaching;

			expect(media.busy).toBe(false);
			expect(player.error).toBe('Apple Music could not be loaded.');
		} finally {
			resetAppleMusic();
			vi.useRealTimers();
			vi.unstubAllGlobals();
		}
	});

	it('hands the workbench back when the Spotify SDK never loads', async () => {
		vi.useFakeTimers();
		stubDeadScripts();
		try {
			const { media, player } = setup();
			const attaching = media.attachSpotifyTrack('4cOdK2wGLETKBW3PvgPWqT', 'Mul — Sensommer');
			expect(media.busy).toBe(true);

			await vi.advanceTimersByTimeAsync(spotifySdkLoadTimeoutMs - 1);
			expect(media.busy).toBe(true);

			await vi.advanceTimersByTimeAsync(1);
			await attaching;

			expect(media.busy).toBe(false);
			expect(player.error).toBe('The Spotify player could not be loaded.');
		} finally {
			vi.useRealTimers();
			vi.unstubAllGlobals();
		}
	});
});

describe('what a copy says about the song', () => {
	it('answers with the remote source and never with a file', async () => {
		const { media } = setup();
		expect(media.clipboardSource()).toBeUndefined();

		await media.attachYouTube('https://youtu.be/dQw4w9WgXcQ');
		expect(media.clipboardSource()).toEqual({
			kind: 'youtube',
			id: 'dQw4w9WgXcQ',
			name: 'youtu.be/dQw4w9WgXcQ'
		});

		await media.detach();
		await media.attach();
		expect(media.clipboardSource()).toBeUndefined();
	});

	it('answers for a pending song without loading anything', async () => {
		const repository = createInMemoryMediaRepository();
		await repository.attach({
			draftId: 'draft-1',
			name: 'Kygo — Stole the Show',
			source: 'apple',
			songId: '1091453645'
		});
		const { media, player } = setup({ repository });
		await media.openFor('draft-1');

		expect(player.attached).toBe(false);
		expect(media.clipboardSource()).toEqual({
			kind: 'apple',
			id: '1091453645',
			name: 'Kygo — Stole the Show'
		});
	});
});
