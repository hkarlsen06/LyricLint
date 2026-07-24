import type {
	AutosaveStatus,
	Diagnostic,
	DraftSummary,
	EditorHandle,
	PerformerRecord,
	Severity
} from '../core/types.js';

/** Tabs owned by the application shell's collapsible right panel. */
export type RightPanelTab = 'linter' | 'performers' | 'tools';

/**
 * Props for the future root workspace component.
 *
 * The shell owns panel and draft metadata while all live text and selection
 * state remains behind `editor`.
 */
export interface WorkspaceProps {
	editor: EditorHandle;
	activeTab: RightPanelTab;
	panelCollapsed: boolean;
}

/** Events emitted by the future workspace layout controls. */
export interface WorkspaceEvents {
	tabChange: RightPanelTab;
	panelCollapsedChange: boolean;
}

/** Props for the future draft/document toolbar component. */
export interface DocumentToolbarProps {
	title: string;
	saveStatus: AutosaveStatus;
	canUndo: boolean;
	canRedo: boolean;
}

/** Events emitted by toolbar commands without directly mutating editor text. */
export interface DocumentToolbarEvents {
	undo: undefined;
	redo: undefined;
	assignPerformers: undefined;
	insertSectionHeader: undefined;
	copyCanonical: undefined;
}

/** Props for the future linter/performer/tools panel component. */
export interface RightPanelProps {
	activeTab: RightPanelTab;
	diagnostics: readonly Diagnostic[];
	severityFilter: readonly Severity[];
	performers: readonly PerformerRecord[];
	ignoredRuleCount: number;
}

/** Events emitted by the future right panel and mirrored diagnostic list. */
export interface RightPanelEvents {
	tabChange: RightPanelTab;
	diagnosticActivate: Diagnostic;
	restoreIgnoredRule: string;
}

/** Props for the future draft menu component. */
export interface DraftMenuProps {
	currentDraftId?: string;
	drafts: readonly DraftSummary[];
}

/** Events emitted by draft lifecycle controls. */
export interface DraftMenuEvents {
	open: string;
	create: undefined;
	rename: { id: string; title: string };
	duplicate: string;
	export: string;
	delete: string;
	deleteAll: undefined;
}
