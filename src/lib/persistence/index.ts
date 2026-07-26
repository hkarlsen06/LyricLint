export {
	DEFAULT_DATABASE_NAME,
	LyricLintDatabase,
	closeDatabase,
	openDatabase
} from './database.js';
export { createDraftRepository } from './draft-repository.js';
export { createMediaRepository } from './media-repository.js';
export type { MediaAttachInput, MediaRepository } from './media-repository.js';
export { createAutosaveController } from './autosave.js';
export { recoverStartupDraft } from './recovery.js';
export { createSessionIgnoreStore } from './session-ignores.js';
export type {
	AppMetadataRecord,
	AutosaveController,
	AutosaveOptions,
	AutosaveSnapshot,
	AutosaveStatus,
	DraftCreateInput,
	DraftRecord,
	DraftRepository,
	DraftSummary,
	MediaHandleRecord,
	PerformerRecord,
	SerializedSelection,
	SessionIgnoreStore,
	SessionStorageLike
} from './types.js';
