import type { MediaRepository } from '$lib/persistence/media-repository.js';
import type { FeedbackState } from './feedback.svelte.js';
import type { MediaPlayer, MediaSourceKind } from './media-player.svelte.js';
import { createMediaPlayer } from './media-player.svelte.js';
import { parseYouTubeVideoId } from './media-youtube.js';
import type { SpotifySearchOutcome } from './media-spotify.js';
import { parseSpotifyTrackId, searchSpotifyTracks } from './media-spotify.js';
import type { AppleMusicSearchOutcome } from './media-apple.js';
import {
	appleMusicConfigured,
	configureAppleMusic,
	parseAppleMusicSongId,
	searchAppleMusicSongs
} from './media-apple.js';
import {
	beginSpotifySignIn,
	completeSpotifySignIn,
	spotifyAccessToken,
	spotifyConfigured,
	spotifyInsecureOriginMessage,
	spotifyRedirectAllowed,
	spotifySignedIn
} from './spotify-auth.js';

/**
 * The parts of the File System Access API this store uses.
 *
 * Declared locally because TypeScript's DOM library ships `FileSystemFileHandle`
 * but neither `showOpenFilePicker` nor the permission methods, and the whole
 * point of the handle is that it survives a reload — which is exactly what those
 * two methods govern.
 */
type PermissionState = 'granted' | 'denied' | 'prompt';

interface PersistableFileHandle extends FileSystemFileHandle {
	queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
	requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
}

interface FilePickerWindow {
	showOpenFilePicker?(options: {
		multiple?: boolean;
		types?: { description: string; accept: Record<string, string[]> }[];
	}): Promise<FileSystemFileHandle[]>;
}

const audioExtensions = ['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.webm'];

/**
 * How often a moving playhead is written down, in milliseconds.
 *
 * `timeupdate` fires several times a second, and the position only has to be
 * right to within the last few seconds of listening — anything more precise is
 * an IndexedDB write per frame for a number nobody will notice being stale. A
 * pause, the end of the track, and a nudge all bypass this and write at once, so
 * the interval only ever governs audio that is still running.
 */
const positionWriteIntervalMs = 5000;

/**
 * The longest filename worth calling a draft.
 *
 * A search result is `Artist — Title` and is always worth having. A filename is
 * not reliably anything: `01 Track.mp3` is a fine title, and
 * `Artist - Album (2011 Remaster) [FLAC 24-96] - 07 - Title.mp3` is a rip's
 * bookkeeping. There is no way to tell them apart except by how much of it there
 * is, so the long ones are left alone rather than guessed at — an `Untitled
 * draft` the user renames beats a title they have to clear first.
 */
const longestFilenameTitle = 60;

/**
 * A filename as a draft title, or nothing when it is one of the long ones.
 *
 * The extension goes: it is a fact about a file on a disk, and this is the name
 * of a transcription. Only the last one, so `Song (feat. X).mp3` keeps its
 * parenthesis and `.mp3` alone is not left as a title.
 */
function titleFromFilename(name: string): string | undefined {
	const withoutExtension = name.replace(/\.[a-z0-9]{1,5}$/i, '').trim();
	if (withoutExtension === '' || withoutExtension.length > longestFilenameTitle) return undefined;
	return withoutExtension;
}

export interface MediaStoreDependencies {
	repository: MediaRepository;
	feedback: FeedbackState;
	draftId: () => string;
	player?: MediaPlayer;
	/** Injectable so tests choose a file without a picker. */
	pickFile?: () => Promise<{ file: File; handle?: FileSystemFileHandle } | undefined>;
	/** Injectable so tests drive the write throttle without waiting on a clock. */
	clock?: () => number;
	/**
	 * Tell the draft it now has something worth a record.
	 *
	 * A draft with no text is never written, so audio attached before the first
	 * keystroke was written against an id no reload would ever produce again —
	 * the record survived and the draft that owned it did not. The same shape of
	 * call `onLineAnchorsChanged` makes, and for the same reason: this changes
	 * nothing about the document, so nothing else will schedule the save.
	 */
	onAttached?: () => void;
	/**
	 * A name worth calling the draft, when the source has one.
	 *
	 * Only ever a *real* name. The provisional labels a link paste starts with —
	 * `youtu.be/dQw4w9WgXcQ`, `music.apple.com/song/1091453645` — are exactly what
	 * a draft must not be called, and this is the one place that can tell them
	 * apart, because it is where they are minted. A late `named` from the source
	 * arrives here too, so a link paste still gets its title once the catalogue
	 * answers.
	 *
	 * Whether to spend it is the workbench's call, not this store's: a draft the
	 * user has already named is not up for renaming.
	 */
	onTitleSuggestion?: (title: string) => void;
}

export interface MediaStore {
	readonly player: MediaPlayer;
	/**
	 * The name of audio this draft remembers but cannot open yet.
	 *
	 * A file handle read back from storage usually needs one user gesture before
	 * the browser will hand over the bytes again, and a reload is not a gesture.
	 * So a returning draft says which file it wants and waits to be asked, rather
	 * than failing silently or throwing a permission prompt at a page nobody has
	 * touched.
	 */
	readonly pendingName: string | undefined;
	/** What `pendingName` refers to, so a surface can say which press it is. */
	readonly pendingSource: MediaSourceKind | undefined;
	/**
	 * The video this draft is on, loaded or still waiting on the opt-in.
	 *
	 * Not `pendingVideoId`, which is only the half of that the picker has yet to
	 * spend a gesture on. This is the durable fact, so the picker can offer the
	 * link already in use rather than an empty field over a video the user would
	 * otherwise have to go and find again.
	 */
	readonly videoId: string | undefined;
	/** The Spotify track this draft is on, for the same reason as `videoId`. */
	readonly trackId: string | undefined;
	/** The Apple Music song this draft is on, for the same reason again. */
	readonly songId: string | undefined;
	/**
	 * Whether this build carries a live Apple Music developer token.
	 *
	 * False when `PUBLIC_APPLE_MUSIC_TOKEN` is unset *or has expired* — the
	 * second is the one that matters, because a developer token lasts at most six
	 * months and the honest failure of a stale one is the picker not offering
	 * Apple Music rather than a 401 under a press.
	 */
	readonly appleMusicAvailable: boolean;
	/**
	 * Whether this build has a Spotify app registered behind it.
	 *
	 * False when `PUBLIC_SPOTIFY_CLIENT_ID` is unset, which is the honest state of
	 * a feature whose credential is missing — the picker then does not offer an
	 * answer it cannot carry out, rather than offering one that fails on press.
	 */
	readonly spotifyAvailable: boolean;
	readonly busy: boolean;
	/**
	 * Whether the user has chosen YouTube in this session.
	 *
	 * This is the gate, and it is the only thing standing between a page load and
	 * a request to Google: nothing loads the IFrame API until it is true, and it
	 * only becomes true inside a call the user's own press made. It is
	 * deliberately **not** persisted — a stored "yes" would load Google's script
	 * on a page the user has not touched, which is the whole thing the opt-in
	 * exists to prevent. A remembered video therefore comes back waiting to be
	 * asked, exactly as a remembered file handle does.
	 */
	readonly youtubeAllowed: boolean;
	/**
	 * Open the file picker. True when a file was taken, false when the user
	 * dismissed it — the surface that opened this needs to know which, so it can
	 * close on an answer and stay open on a cancel.
	 */
	attach(): Promise<boolean>;
	attachFile(file: File, handle?: FileSystemFileHandle): Promise<void>;
	/**
	 * Take a pasted YouTube link, and with it the user's consent to load Google's
	 * player. Resolves to a message when the link is not one, and to nothing when
	 * it is.
	 */
	attachYouTube(url: string): Promise<string | undefined>;
	/**
	 * Take a pasted Spotify link, signing in first if this session has not.
	 *
	 * Resolves to a message when the link is not a track link, and to nothing
	 * otherwise — including when "otherwise" means the page is about to navigate
	 * to Spotify's authorize screen. The link is carried across that redirect and
	 * this method is called again with it on the way back, so a caller writes one
	 * path and not two.
	 */
	attachSpotify(url: string): Promise<string | undefined>;
	/**
	 * Find a track by name, signing in first if this session has not.
	 *
	 * The way in that does not require the user to go and fetch a link — which is
	 * a trip to another application to answer a question this one can ask. A query
	 * that happens to *be* a link is attached rather than searched, so the paste
	 * still works and costs no second control.
	 */
	searchSpotify(query: string): Promise<SpotifySearchOutcome>;
	/** Attach a track the user picked out of those results. */
	attachSpotifyTrack(trackId: string, name: string): Promise<void>;
	/**
	 * Find a song by name, or attach one outright when the query is a link.
	 *
	 * The same one-field shape as `searchSpotify`, and simpler underneath: Apple's
	 * catalogue is public data behind this build's own developer token, so nothing
	 * is signed in to yet and there is no redirect to survive. The sign-in happens
	 * later, inside the attach, where MusicKit runs it in a window of its own.
	 */
	searchAppleMusic(query: string): Promise<AppleMusicSearchOutcome>;
	/** Attach a song the user picked out of those results. */
	attachAppleMusicSong(songId: string, name: string): Promise<void>;
	/**
	 * Load and configure MusicKit ahead of the press that will sign in.
	 *
	 * A sign-in opens a pop-up, and a browser only allows one from a press it can
	 * still see: Safari counts the activation from the press *itself*, so anything
	 * awaited in front of `authorize()` spends it. Attaching used to await Apple's
	 * ~600KB SDK and its `configure()` round trips first, which is several seconds
	 * on a cold load — so by the time the sign-in was asked for, the press it
	 * belonged to was long gone and the window was blocked every time.
	 *
	 * So the script is bought with an *earlier* press than the one that needs it.
	 * Opening the audio dialog is that press, and it is still a press — this is
	 * not the module-scope load that `youtubeAllowed` exists to prevent, and it is
	 * not on a page the user has not touched. By the time a result is pressed the
	 * instance is already there, `authorize()` runs in the same tick, and the
	 * pop-up opens.
	 *
	 * Fire and forget, and deliberately silent: nothing is being attached yet, so
	 * a failure here has nothing to report and the real press will report its own.
	 */
	prepareAppleMusic(): void;
	/**
	 * The search a sign-in interrupted, handed back once, for the surface to
	 * reopen on. Reading it clears it: a query left standing would reopen the
	 * picker on every later render.
	 */
	takeResumedQuery(): string | undefined;
	/**
	 * Finish a sign-in this page load is returning from, if it is.
	 *
	 * Called once at boot. On an ordinary load it does nothing at all; on the load
	 * that comes back from Spotify it exchanges the code and re-attaches whatever
	 * the user was in the middle of adding.
	 */
	resumeSignIn(): Promise<void>;
	reconnect(): Promise<void>;
	detach(): Promise<void>;
	/** Move the attached audio to whichever draft is now open. */
	openFor(draftId: string): Promise<void>;
	/**
	 * Write the playhead down now, whatever the throttle would have said.
	 *
	 * Called when the tab is being hidden, beside the autosave flush: a reload or
	 * a close is exactly the moment the last few seconds of listening would
	 * otherwise be the ones lost.
	 */
	flushPosition(): Promise<void>;
	destroy(): void;
}

async function defaultPickFile(): Promise<
	{ file: File; handle?: FileSystemFileHandle } | undefined
> {
	const picker = globalThis as unknown as FilePickerWindow;

	if (typeof picker.showOpenFilePicker === 'function') {
		try {
			const [handle] = await picker.showOpenFilePicker({
				multiple: false,
				types: [{ description: 'Audio', accept: { 'audio/*': audioExtensions } }]
			});
			return handle ? { file: await handle.getFile(), handle } : undefined;
		} catch {
			// The user dismissed the picker. That is an answer, not a failure.
			return undefined;
		}
	}

	// Firefox and Safari: no picker API, so no handle to remember. The draft keeps
	// the file's name and asks for it again next session.
	return await new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'audio/*';
		input.addEventListener('change', () => {
			const file = input.files?.[0];
			resolve(file ? { file } : undefined);
		});
		input.addEventListener('cancel', () => resolve(undefined));
		input.click();
	});
}

/**
 * Audio attachment, and its one durable fact: what a draft is transcribed from.
 *
 * The song *is* the draft, so the attachment belongs to the draft rather than to
 * the session — open a draft tomorrow and the same track is one press away. What
 * is stored is a pointer, never bytes: a 60MB blob per draft would spend the
 * origin's entire quota on one song and make "Delete all local data" a much
 * larger promise than it looks. For a local file that pointer is a handle and a
 * name; for a video it is an eleven-character id.
 *
 * The two sources differ here in exactly one place, and it is not playback: a
 * file waits on a permission the browser will only grant to a gesture, and a
 * video waits on the user's consent to load Google's player at all. Both are the
 * same shape of question, both are asked by the same control, and neither is
 * remembered as answered.
 */
export function createMediaStore(deps: MediaStoreDependencies): MediaStore {
	const feedback = deps.feedback;
	const player = deps.player ?? createMediaPlayer({ feedback });
	const pickFile = deps.pickFile ?? defaultPickFile;

	const clock = deps.clock ?? (() => Date.now());

	let pendingName = $state<string | undefined>(undefined);
	let pendingSource = $state<MediaSourceKind | undefined>(undefined);
	let pendingHandle: PersistableFileHandle | undefined;
	let pendingVideoId: string | undefined;
	let pendingTrackId: string | undefined;
	let pendingSongId: string | undefined;
	let pendingPosition: number | undefined;
	let currentVideoId = $state<string | undefined>(undefined);
	let currentTrackId = $state<string | undefined>(undefined);
	let currentSongId = $state<string | undefined>(undefined);
	let busy = $state(false);
	let youtubeAllowed = $state(false);
	let resumedQuery = $state<string | undefined>(undefined);

	// The draft the loaded audio belongs to, which is not always the draft that is
	// open: switching drafts detaches, and a position write racing that switch
	// would otherwise stamp the old track's playhead onto the new draft.
	let ownerDraftId: string | undefined;
	let lastWriteAt = 0;
	let lastWritten: number | undefined;

	async function writePosition(position: number): Promise<void> {
		const draftId = ownerDraftId;
		if (draftId === undefined) return;
		lastWriteAt = clock();
		lastWritten = position;
		try {
			await deps.repository.savePosition(draftId, position);
		} catch {
			// The position is a convenience. Losing it is not worth a message.
		}
	}

	player.setProgressListener((time, reason) => {
		if (reason === 'settled') {
			void writePosition(time);
			return;
		}
		if (clock() - lastWriteAt < positionWriteIntervalMs) return;
		void writePosition(time);
	});

	// A video arrives as an id and becomes a title once Google's player answers.
	// That is the name the strip shows and the name next session's control says,
	// so it is written against the draft the audio belongs to, like the position.
	player.setNameListener((name) => {
		// A source only reports a name once it actually knows one, so this is always
		// worth offering — it is how a pasted link gets a title at all.
		deps.onTitleSuggestion?.(name);
		const draftId = ownerDraftId;
		if (draftId === undefined) return;
		void deps.repository.saveName(draftId, name).catch(() => {
			// A better label is a convenience. Losing it is not worth a message.
		});
	});

	async function remember(file: File, handle?: FileSystemFileHandle): Promise<void> {
		try {
			await deps.repository.attach({
				draftId: deps.draftId(),
				name: file.name,
				size: file.size,
				source: 'file',
				handle,
				...(pendingPosition === undefined ? {} : { position: pendingPosition })
			});
		} catch {
			// Playback still works for this session; only the memory of it is lost.
			feedback.announce('This audio could not be remembered for next time.');
		}
	}

	/**
	 * Drop every trace of what this draft was pointing at.
	 *
	 * One function rather than the same run of assignments written out at each of
	 * the three call sites, because a source added later is a field added here —
	 * and a field added to one of three hand-written copies and missed by the
	 * other two is the failure mode that cost this codebase a whole synced song
	 * once already.
	 */
	function forget(): void {
		pendingName = undefined;
		pendingSource = undefined;
		pendingHandle = undefined;
		pendingVideoId = undefined;
		pendingTrackId = undefined;
		pendingSongId = undefined;
		pendingPosition = undefined;
		currentVideoId = undefined;
		currentTrackId = undefined;
		currentSongId = undefined;
	}

	/** Everything a new attachment forgets, whichever kind it is. */
	function claim(): number | undefined {
		const startAt = pendingPosition;
		forget();
		ownerDraftId = deps.draftId();
		lastWriteAt = clock();
		lastWritten = startAt;
		// Every attachment path lands here — file, video and track — so this is the
		// one place the draft has to be told, rather than three that each have to
		// remember.
		deps.onAttached?.();
		return startAt;
	}

	function adopt(file: File, handle?: FileSystemFileHandle): void {
		const startAt = claim();
		const suggestion = titleFromFilename(file.name);
		if (suggestion !== undefined) deps.onTitleSuggestion?.(suggestion);
		player.attach(file, {
			name: file.name,
			handle,
			size: file.size,
			...(startAt === undefined ? {} : { startAt })
		});
	}

	async function adoptVideo(videoId: string, name: string): Promise<void> {
		const startAt = claim();
		// A search result arrives already named; a pasted link arrives as its own
		// URL, and that one waits for the catalogue rather than titling a draft
		// after an address.
		if (name !== provisionalName(videoId)) deps.onTitleSuggestion?.(name);
		currentVideoId = videoId;
		await player.attachVideo({
			videoId,
			name,
			...(startAt === undefined ? {} : { startAt })
		});
	}

	async function adoptTrack(trackId: string, name: string): Promise<void> {
		const startAt = claim();
		// A search result arrives already named; a pasted link arrives as its own
		// URL, and that one waits for the catalogue rather than titling a draft
		// after an address.
		if (name !== provisionalTrackName(trackId)) deps.onTitleSuggestion?.(name);
		currentTrackId = trackId;
		await player.attachTrack({
			trackId,
			name,
			...(startAt === undefined ? {} : { startAt })
		});
	}

	async function adoptSong(songId: string, name: string): Promise<void> {
		const startAt = claim();
		// A search result arrives already named; a pasted link arrives as its own
		// URL, and that one waits for the catalogue rather than titling a draft
		// after an address.
		if (name !== provisionalSongName(songId)) deps.onTitleSuggestion?.(name);
		currentSongId = songId;
		await player.attachSong({
			songId,
			name,
			...(startAt === undefined ? {} : { startAt })
		});
	}

	/** What a video is called before Google's player says what it actually is. */
	function provisionalName(videoId: string): string {
		return `youtu.be/${videoId}`;
	}

	/** The same, for a track, until Spotify answers with an artist and a title. */
	function provisionalTrackName(trackId: string): string {
		return `open.spotify.com/track/${trackId}`;
	}

	/** The link form, which is what a sign-in carries across the redirect. */
	function spotifyLink(trackId: string): string {
		return `https://open.spotify.com/track/${trackId}`;
	}

	/** And the same, for a song, until Apple's catalogue answers with a title. */
	function provisionalSongName(songId: string): string {
		return `music.apple.com/song/${songId}`;
	}

	const store: MediaStore = {
		get player() {
			return player;
		},
		get pendingName() {
			return pendingName;
		},
		get pendingSource() {
			return pendingSource;
		},
		get videoId() {
			return currentVideoId;
		},
		get trackId() {
			return currentTrackId;
		},
		get songId() {
			return currentSongId;
		},
		get spotifyAvailable() {
			return spotifyConfigured();
		},
		get appleMusicAvailable() {
			return appleMusicConfigured();
		},
		get busy() {
			return busy;
		},
		get youtubeAllowed() {
			return youtubeAllowed;
		},

		async attach() {
			if (busy) return false;
			busy = true;
			try {
				const picked = await pickFile();
				if (!picked) return false;
				adopt(picked.file, picked.handle);
				await remember(picked.file, picked.handle);
				return true;
			} finally {
				busy = false;
			}
		},

		async attachFile(file, handle) {
			adopt(file, handle);
			await remember(file, handle);
		},

		/**
		 * The press that is both the link and the consent.
		 *
		 * Nothing has contacted Google before this runs, and this only runs from a
		 * control the user pressed after reading what it costs — so granting here
		 * is the opt-in, not a record of one made elsewhere. A link that is not one
		 * is answered with a message and grants nothing.
		 */
		async attachYouTube(url) {
			const parsed = parseYouTubeVideoId(url);
			if ('error' in parsed) return parsed.error;
			if (busy) return undefined;

			busy = true;
			try {
				youtubeAllowed = true;
				const name = provisionalName(parsed.videoId);
				const attaching = adoptVideo(parsed.videoId, name);
				try {
					await deps.repository.attach({
						draftId: deps.draftId(),
						name,
						source: 'youtube',
						videoId: parsed.videoId
					});
				} catch {
					feedback.announce('This video could not be remembered for next time.');
				}
				await attaching;
				return undefined;
			} finally {
				busy = false;
			}
		},

		/**
		 * The press that is both the link and, when it has to be, the sign-in.
		 *
		 * Two outcomes look identical to the caller and that is the point: either
		 * the track attaches, or the page leaves for Spotify's authorize screen
		 * carrying this same link and comes back through `resumeSignIn` to run this
		 * again. A surface therefore closes on `undefined` without having to know
		 * which of the two it got — on the redirect branch there is no surface left
		 * to close.
		 *
		 * The parse happens *before* the sign-in, so a typo costs a message rather
		 * than a round trip to Spotify and back.
		 */
		async attachSpotify(url) {
			const parsed = parseSpotifyTrackId(url);
			if ('error' in parsed) return parsed.error;
			if (!spotifyConfigured()) return 'Spotify is not configured for this build.';
			if (busy) return undefined;

			if (!spotifySignedIn()) {
				if (!spotifyRedirectAllowed()) return spotifyInsecureOriginMessage();
				await beginSpotifySignIn(spotifyLink(parsed.trackId));
				return undefined;
			}

			await store.attachSpotifyTrack(parsed.trackId, provisionalTrackName(parsed.trackId));
			return undefined;
		},

		/**
		 * The way in that asks the question instead of sending the user off to find
		 * a link, and the sign-in when this session has not had one.
		 *
		 * A query that parses as a link is attached rather than searched. That is
		 * not a special case bolted on: a pasted link and a typed title are the same
		 * gesture aimed at the same field, and answering both from one control is
		 * what keeps this section to the one row the picker has room for.
		 */
		async searchSpotify(query) {
			const trimmed = query.trim();
			if (trimmed === '') return { results: [] };
			if (!spotifyConfigured()) return { error: 'Spotify is not configured for this build.' };

			const parsed = parseSpotifyTrackId(trimmed);
			if ('trackId' in parsed) {
				const message = await store.attachSpotify(trimmed);
				return message === undefined ? { results: [] } : { error: message };
			}

			// The query rides across the redirect the way a link does, so a first
			// search is not lost to the sign-in that it triggered.
			if (!spotifySignedIn()) {
				if (!spotifyRedirectAllowed()) return { error: spotifyInsecureOriginMessage() };
				await beginSpotifySignIn(trimmed);
				return { signingIn: true };
			}

			return await searchSpotifyTracks(trimmed, { token: spotifyAccessToken });
		},

		async attachSpotifyTrack(trackId, name) {
			if (busy) return;
			busy = true;
			try {
				const attaching = adoptTrack(trackId, name);
				try {
					await deps.repository.attach({
						draftId: deps.draftId(),
						name,
						source: 'spotify',
						trackId
					});
				} catch {
					feedback.announce('This track could not be remembered for next time.');
				}
				await attaching;
			} finally {
				busy = false;
			}
		},

		/**
		 * The same one field, two gestures shape as the Spotify search, minus the
		 * redirect it has to survive.
		 *
		 * A search here signs in to nothing: Apple's catalogue answers to this
		 * build's own developer token, so a user can find the song before they are
		 * ever asked for an account. The sign-in is spent on the *attach*, which is
		 * both later and the press that actually needs it.
		 */
		async searchAppleMusic(query) {
			const trimmed = query.trim();
			if (trimmed === '') return { results: [] };
			if (!appleMusicConfigured()) {
				return { error: 'Apple Music is not configured for this build.' };
			}

			const parsed = parseAppleMusicSongId(trimmed);
			if ('songId' in parsed) {
				await store.attachAppleMusicSong(parsed.songId, provisionalSongName(parsed.songId));
				return { results: [] };
			}

			return await searchAppleMusicSongs(trimmed, { music: () => configureAppleMusic() });
		},

		prepareAppleMusic() {
			if (!appleMusicConfigured()) return;
			void configureAppleMusic().catch(() => undefined);
		},

		async attachAppleMusicSong(songId, name) {
			if (busy) return;
			busy = true;
			try {
				const attaching = adoptSong(songId, name);
				try {
					await deps.repository.attach({
						draftId: deps.draftId(),
						name,
						source: 'apple',
						songId
					});
				} catch {
					feedback.announce('This song could not be remembered for next time.');
				}
				await attaching;
			} finally {
				busy = false;
			}
		},

		takeResumedQuery() {
			const query = resumedQuery;
			resumedQuery = undefined;
			return query;
		},

		/**
		 * The other half of `attachSpotify`, on the load that comes back.
		 *
		 * Silent on every ordinary load, which is nearly all of them. A refusal is
		 * announced rather than swallowed: the user pressed something, was sent to
		 * Spotify, and came back to a workbench that would otherwise look exactly as
		 * it did before they pressed it.
		 */
		async resumeSignIn() {
			const returned = await completeSpotifySignIn();
			if (returned === undefined) return;
			if (returned.error !== undefined) {
				feedback.announce(returned.error);
				return;
			}
			if (returned.intent === undefined) return;

			// The intent is whatever the user was in the middle of, and it is one of
			// two things. A link attaches straight away — that is `reconnect`'s path
			// and the paste's. A search term cannot attach anything on its own, so it
			// is handed back for the picker to reopen on, because a user who typed a
			// title, got sent to Spotify and came back to an untouched workbench has
			// been made to do the same work twice.
			const parsed = parseSpotifyTrackId(returned.intent);
			if ('error' in parsed) {
				resumedQuery = returned.intent;
				return;
			}
			const message = await store.attachSpotify(returned.intent);
			if (message !== undefined) feedback.announce(message);
		},

		/**
		 * Spend the user's gesture on the remembered handle.
		 *
		 * `requestPermission` is why this may only be called from a real press: the
		 * browser drops the prompt on the floor otherwise, and the draft would look
		 * as though its audio had simply vanished.
		 */
		async reconnect() {
			if (busy) return;
			busy = true;
			try {
				// A remembered video is the same shape of question as a remembered
				// file handle — the browser will not act on either without a gesture,
				// and here the gesture is also the session's consent to load Google's
				// player. So it is one press in the same slot, and nothing before it.
				if (pendingSource === 'youtube') {
					const videoId = pendingVideoId;
					if (videoId === undefined) return;
					youtubeAllowed = true;
					await adoptVideo(videoId, pendingName ?? provisionalName(videoId));
					return;
				}

				// A remembered track is the same question again, with the sign-in in
				// the place the permission prompt and the consent occupy: this press
				// is what pays for it, and the link it leaves with is this track's.
				if (pendingSource === 'spotify') {
					const trackId = pendingTrackId;
					if (trackId === undefined) return;
					if (!spotifySignedIn()) {
						if (!spotifyRedirectAllowed()) {
							feedback.announce(spotifyInsecureOriginMessage());
							return;
						}
						await beginSpotifySignIn(spotifyLink(trackId));
						return;
					}
					await adoptTrack(trackId, pendingName ?? provisionalTrackName(trackId));
					return;
				}

				// And a remembered song is the question a third time. This one is
				// *always* pending, with no already-signed-in shortcut: answering
				// whether MusicKit still holds a user token means loading Apple's SDK,
				// which is the very thing a page nobody has touched must not do. So the
				// press pays for the script and the sign-in together, and where Apple
				// already has a session the sign-in step passes straight through.
				if (pendingSource === 'apple') {
					const songId = pendingSongId;
					if (songId === undefined) return;
					await adoptSong(songId, pendingName ?? provisionalSongName(songId));
					return;
				}

				const handle = pendingHandle;
				if (handle?.requestPermission) {
					const permission = await handle.requestPermission({ mode: 'read' });
					if (permission !== 'granted') {
						feedback.announce('Permission to read that audio file was declined.');
						return;
					}
				}

				if (handle) {
					try {
						adopt(await handle.getFile(), handle);
						return;
					} catch {
						// Moved, renamed, or deleted since it was attached.
						feedback.announce(`${pendingName ?? 'That file'} could not be reopened.`);
					}
				}

				const picked = await pickFile();
				if (!picked) return;
				adopt(picked.file, picked.handle);
				await remember(picked.file, picked.handle);
			} finally {
				busy = false;
			}
		},

		async detach() {
			const detached = player.name ?? pendingName;
			// Before the player is torn down: its `pause` reports one last position,
			// and writing that to a record about to be deleted would put the row
			// back the moment after it went.
			ownerDraftId = undefined;
			player.detach();
			forget();
			lastWritten = undefined;
			try {
				await deps.repository.detach(deps.draftId());
			} catch {
				feedback.announce('Local storage could not be updated.');
			}
			if (detached) feedback.announce(`${detached} detached.`);
		},

		async openFor(draftId) {
			// Whatever was playing belongs to the draft being left, so its last
			// position is written against that draft before the owner moves.
			await store.flushPosition();
			ownerDraftId = undefined;
			player.detach();
			forget();
			lastWritten = undefined;

			let record;
			try {
				record = await deps.repository.get(draftId);
			} catch {
				return;
			}
			if (!record) return;

			pendingName = record.name;
			pendingSource = record.source ?? 'file';
			pendingHandle = record.handle as PersistableFileHandle | undefined;
			pendingVideoId = record.videoId;
			pendingTrackId = record.trackId;
			pendingSongId = record.songId;
			pendingPosition = record.position;
			currentVideoId = record.videoId;
			currentTrackId = record.trackId;
			currentSongId = record.songId;

			// A video is loaded without a press only where the user has already said
			// yes to Google in this session — the same trade the file path makes with
			// an already-granted permission, and for the same reason: a page nobody
			// has touched must not reach out on its own.
			if (pendingSource === 'youtube') {
				if (!youtubeAllowed || pendingVideoId === undefined) return;
				await adoptVideo(pendingVideoId, pendingName);
				return;
			}

			// And a track comes back without a press only where this session has
			// already signed in — the same trade, with the sign-in standing where
			// the granted permission and the YouTube consent stand.
			if (pendingSource === 'spotify') {
				if (!spotifySignedIn() || pendingTrackId === undefined) return;
				await adoptTrack(pendingTrackId, pendingName);
				return;
			}

			// A song always waits to be asked. Whether Apple still has a session for
			// this user is a question only MusicKit can answer, and asking it means
			// loading Apple's script — so the honest thing is to draw the press and
			// let it pay for both. It falls through to the file branch harmlessly
			// (there is no handle), but only by accident, and an accident is not what
			// this should rest on.
			if (pendingSource === 'apple') return;

			// A permission already granted for this origin needs no gesture, so the
			// track simply comes back where it was left. Anything else waits to be
			// asked — `adopt` carries the position through either path.
			if (!pendingHandle?.queryPermission) return;
			try {
				if ((await pendingHandle.queryPermission({ mode: 'read' })) !== 'granted') return;
				adopt(await pendingHandle.getFile(), pendingHandle);
			} catch {
				// Leave it pending; the press will report what went wrong.
			}
		},

		async flushPosition() {
			if (ownerDraftId === undefined || !player.attached) return;
			const time = player.liveTime();
			if (time === lastWritten) return;
			await writePosition(time);
		},

		destroy() {
			player.setProgressListener(undefined);
			player.setNameListener(undefined);
			ownerDraftId = undefined;
			player.destroy();
		}
	};

	return store;
}
