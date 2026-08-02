import type { AtomicDocumentEdit } from '$lib/core/types.js';

/**
 * The assistant store's editor seam. The root-mounted store can read, preview,
 * and apply against the open draft without depending on CodeMirror or the
 * workspace controller that owns it.
 */
export interface AssistantDraftBridge {
	draftId(): string;
	readText(): string;
	revision(): number;
	/** False when the edit is stale or the editor refuses the preview. */
	preview(edit: AtomicDocumentEdit): boolean;
	clearPreview(): void;
	/** Clear the preview and apply one atomic undo step; false on stale/throw. */
	apply(edit: AtomicDocumentEdit): boolean;
	/** Current linked groups, addressed by 1-based header line number. */
	sectionLinks(): Array<{ lines: number[] }>;
	/** Whether every named header is a linkable song part in the active language. */
	linkableSections(headerLines: number[]): boolean;
	/** Create or extend a group without replacing any deliberate differences. */
	linkSections(headerLines: number[]): boolean;
	/** Dissolve the complete group containing this header. */
	unlinkSection(headerLine: number): boolean;
}
