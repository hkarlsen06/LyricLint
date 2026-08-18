import type { LyricLintDatabase } from './database.js';
import type { MediaHandleRecord } from './types.js';

function now(): string {
	return new Date().toISOString();
}

/** What a caller supplies when attaching audio; the timestamp is stamped here. */
interface MediaAttachInput {
	draftId: string;
	name: string;
	size?: number;
	/** Absent means `'file'`, which is what every record written before this was. */
	source?: 'file' | 'youtube' | 'spotify' | 'apple';
	videoId?: string;
	trackId?: string;
	songId?: string;
	handle?: FileSystemFileHandle;
	position?: number;
}

export interface MediaRepository {
	get(draftId: string): Promise<MediaHandleRecord | undefined>;
	attach(input: MediaAttachInput): Promise<MediaHandleRecord>;
	/**
	 * Move the remembered playhead without touching anything else on the record.
	 *
	 * A field update rather than a `put`, because this runs while audio is
	 * playing and a whole-record write would carry a stale copy of the handle
	 * back over the live one every few seconds.
	 */
	savePosition(draftId: string, position: number): Promise<void>;
	/**
	 * Rename the remembered source, for the one that arrives late.
	 *
	 * A file is named before it is opened; a video is an id until Google's player
	 * answers with a title. That title is what the strip and next session's
	 * reconnect control say, so it is worth the one extra field update.
	 */
	saveName(draftId: string, name: string): Promise<void>;
	detach(draftId: string): Promise<void>;
	clear(): Promise<void>;
}

/**
 * The attached-audio side of local storage.
 *
 * Deliberately separate from `DraftRepository`: a draft is the text, and audio
 * is a pointer at a file on the user's disk that may or may not still be there.
 * Keeping them apart is what lets the draft record stay JSON.
 */
export function createMediaRepository(database: LyricLintDatabase): MediaRepository {
	return {
		async get(draftId) {
			return await database.mediaHandles.get(draftId);
		},

		async attach({ draftId, name, size, source, videoId, trackId, songId, handle, position }) {
			const record: MediaHandleRecord = {
				draftId,
				name,
				attachedAt: now(),
				...(size === undefined ? {} : { size }),
				...(source === undefined ? {} : { source }),
				...(videoId === undefined ? {} : { videoId }),
				...(trackId === undefined ? {} : { trackId }),
				...(songId === undefined ? {} : { songId }),
				...(handle === undefined ? {} : { handle }),
				...(position === undefined ? {} : { position })
			};
			await database.mediaHandles.put(record);
			return record;
		},

		async savePosition(draftId, position) {
			await database.mediaHandles.update(draftId, { position });
		},

		async saveName(draftId, name) {
			await database.mediaHandles.update(draftId, { name });
		},

		async detach(draftId) {
			await database.mediaHandles.delete(draftId);
		},

		async clear() {
			await database.mediaHandles.clear();
		}
	};
}
