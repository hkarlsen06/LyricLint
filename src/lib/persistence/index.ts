export {
	DEFAULT_DATABASE_NAME,
	LyricLintDatabase,
	closeDatabase,
	openDatabase
} from './database.js';
export { createDraftRepository } from './draft-repository.js';
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
	PerformerRecord,
	SerializedSelection,
	SessionIgnoreStore,
	SessionStorageLike
} from './types.js';
