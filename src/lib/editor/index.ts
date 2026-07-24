export { default as DiagnosticPopover } from './overlays/DiagnosticPopover.svelte';
export { default as EditorPane } from './EditorPane.svelte';
export { default as PerformerPicker } from './overlays/PerformerPicker.svelte';
export { default as SectionPicker } from './overlays/SectionPicker.svelte';

export { safeExternalUrl } from './overlays/diagnostic-popover.js';
export { sectionHeaderOptions, suggestNextOrdinal } from './overlays/section-picker.js';

export type { CreateLyricEditorOptions, LyricEditorInstance } from './create-editor.js';
export type {
	EditorDisplayContext,
	EditorOverlayCallbacks,
	EditorPaneEvents,
	EditorPaneProps,
	LyricEditorCallbacks,
	PerformerAssignmentChoice,
	RevisionedDiagnostics,
	ScreenRect,
	SectionHeaderChoice,
	SelectionAnchor,
	VoiceGroupRange
} from './contracts.js';
export type {
	EditorCallbacks,
	EditorContext,
	EditorHandle,
	EditorSnapshot
} from '../core/types.js';
