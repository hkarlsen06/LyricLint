import { describe, expect, it } from 'vitest';
import { createFeedbackState } from './feedback.svelte.js';
import { createInMemoryMediaRepository } from './in-memory.js';
import { createMediaPlayer } from './media-player.svelte.js';
import { createMediaStore } from './media-store.svelte.js';
import { StubAudio } from './media-test-audio.js';
import { createStubYouTubeApi } from './media-test-youtube.js';
import type { MediaRepository } from '$lib/persistence/index.js';

/**
 * A file handle whose permission answer the test chooses.
 *
 * The browser is the only thing that can mint a real one, so what is under test
 * is the branch the store takes on each answer, not the API itself.
 */
function fakeHandle(file: File, permission: 'granted' | 'prompt') {
	return {
		kind: 'file' as const,
		name: file.name,
		async queryPermission() {
			return permission;
		},
		async requestPermission() {
			return 'granted' as const;
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
		loadYouTubeApi: youtube.load
	});
	const file = options.file ?? new File([''], 'track.mp3', { type: 'audio/mpeg' });
	const repository = options.repository ?? createInMemoryMediaRepository();
	const media = createMediaStore({
		repository,
		feedback,
		draftId: options.draftId ?? (() => 'draft-1'),
		player,
		pickFile: async () => ({ file, handle: options.handle }),
		clock: options.now ?? (() => 0)
	});

	return { audio, file, media, player, repository, youtube };
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
});
