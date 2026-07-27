import type { MediaRepository } from '$lib/persistence/media-repository.js';
import type { FeedbackState } from './feedback.svelte.js';
import type { MediaPlayer, MediaSourceKind } from './media-player.svelte.js';
import { createMediaPlayer } from './media-player.svelte.js';
import { parseYouTubeVideoId } from './media-youtube.js';

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

export interface MediaStoreDependencies {
	repository: MediaRepository;
	feedback: FeedbackState;
	draftId: () => string;
	player?: MediaPlayer;
	/** Injectable so tests choose a file without a picker. */
	pickFile?: () => Promise<{ file: File; handle?: FileSystemFileHandle } | undefined>;
	/** Injectable so tests drive the write throttle without waiting on a clock. */
	clock?: () => number;
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
	let pendingPosition: number | undefined;
	let currentVideoId = $state<string | undefined>(undefined);
	let busy = $state(false);
	let youtubeAllowed = $state(false);

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

	/** Everything a new attachment forgets, whichever kind it is. */
	function claim(): number | undefined {
		const startAt = pendingPosition;
		pendingName = undefined;
		pendingSource = undefined;
		pendingHandle = undefined;
		pendingVideoId = undefined;
		pendingPosition = undefined;
		currentVideoId = undefined;
		ownerDraftId = deps.draftId();
		lastWriteAt = clock();
		lastWritten = startAt;
		return startAt;
	}

	function adopt(file: File, handle?: FileSystemFileHandle): void {
		const startAt = claim();
		player.attach(file, {
			name: file.name,
			handle,
			size: file.size,
			...(startAt === undefined ? {} : { startAt })
		});
	}

	async function adoptVideo(videoId: string, name: string): Promise<void> {
		const startAt = claim();
		currentVideoId = videoId;
		await player.attachVideo({
			videoId,
			name,
			...(startAt === undefined ? {} : { startAt })
		});
	}

	/** What a video is called before Google's player says what it actually is. */
	function provisionalName(videoId: string): string {
		return `youtu.be/${videoId}`;
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
			pendingName = undefined;
			pendingSource = undefined;
			pendingHandle = undefined;
			pendingVideoId = undefined;
			pendingPosition = undefined;
			currentVideoId = undefined;
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
			pendingName = undefined;
			pendingSource = undefined;
			pendingHandle = undefined;
			pendingVideoId = undefined;
			pendingPosition = undefined;
			currentVideoId = undefined;
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
			pendingPosition = record.position;
			currentVideoId = record.videoId;

			// A video is loaded without a press only where the user has already said
			// yes to Google in this session — the same trade the file path makes with
			// an already-granted permission, and for the same reason: a page nobody
			// has touched must not reach out on its own.
			if (pendingSource === 'youtube') {
				if (!youtubeAllowed || pendingVideoId === undefined) return;
				await adoptVideo(pendingVideoId, pendingName);
				return;
			}

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
