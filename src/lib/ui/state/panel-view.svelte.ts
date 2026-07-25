import type {
	Diagnostic,
	DiagnosticFix,
	EditorHandle,
	EditorSnapshot,
	SessionIgnoreStore,
	Severity
} from '$lib/core/types.js';
import { diagnosticKey, orderDiagnostics } from '$lib/diagnostics/order.js';
import { resolveLegendAssignment } from '$lib/performers/legend-assignment.js';
import type { FeedbackState } from './feedback.svelte.js';

export type RightPanelTab = 'linter' | 'performers' | 'tools';

const allSeverities: Severity[] = ['error', 'warning', 'suggestion', 'manual-review'];

export interface PanelViewDependencies {
	editor: () => EditorHandle;
	snapshot: () => EditorSnapshot;
	draftId: () => string;
	ignoreStore: SessionIgnoreStore;
	feedback: FeedbackState;
}

export interface PanelView {
	readonly activeTab: RightPanelTab;
	readonly activeDiagnosticKey?: string;
	readonly severityFilter: readonly Severity[];
	/**
	 * Whether the severity chips are on screen. It lives here rather than inside
	 * the linter panel because the Linter tab is what reveals them: pressing the
	 * tab a second time, while already inside it, is the toggle.
	 */
	readonly severityFiltersOpen: boolean;
	readonly visibleDiagnostics: readonly Diagnostic[];
	readonly ignoredRuleIds: readonly string[];
	setActiveTab(tab: RightPanelTab): void;
	toggleSeverity(severity: Severity): void;
	/** Show or hide the severity chips; returns the state it settled on. */
	toggleSeverityFilters(): boolean;
	/** Re-read the session ignores for whichever draft is current now. */
	refreshIgnoredRules(): void;
	/** Drop the active card once its diagnostic is gone from the document. */
	pruneActiveDiagnostic(diagnostics: readonly Diagnostic[]): void;
	/**
	 * Once an applied fix has been re-linted, mark the diagnostic the panel now
	 * leads with and put the editor's line wash on it.
	 */
	leadAfterFix(diagnostics: readonly Diagnostic[]): void;
	navigateToDiagnostic(diagnostic: Diagnostic): void;
	/** Mark a diagnostic's card without moving the editor to it. */
	highlightDiagnostic(diagnostic: Diagnostic): void;
	chooseSectionHeader(diagnostic: Diagnostic): void;
	/**
	 * Whether this diagnostic's card should offer the performer assignment at
	 * all. The editor's popover resolves the same question against the same
	 * document, so the two surfaces never disagree about the action existing.
	 */
	canAssignDiagnosticPerformers(diagnostic: Diagnostic): boolean;
	assignDiagnosticPerformers(diagnostic: Diagnostic): void;
	previewFix(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	/**
	 * Show a preview that arrived before the editor could render one. The
	 * bootstrap handle has no `previewAtomic`, so the first expanded card asks
	 * for its diff before CodeMirror exists to draw it.
	 */
	retryFixPreview(): void;
	clearFixPreview(): void;
	applyFix(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	ignoreRule(ruleId: string): void;
	restoreRule(ruleId: string): void;
}

export function createPanelView(deps: PanelViewDependencies): PanelView {
	let activeTab = $state<RightPanelTab>('linter');
	let activeDiagnosticKey = $state<string | undefined>();
	let severityFilter = $state<Severity[]>([...allSeverities]);
	let severityFiltersOpen = $state(false);
	let ignoredRuleIds = $state<string[]>(deps.ignoreStore.list(deps.draftId()));

	const feedback = deps.feedback;

	function setIgnored(ruleId: string, ignored: boolean): void {
		const draftId = deps.draftId();
		if (ignored) deps.ignoreStore.ignore(draftId, ruleId);
		else deps.ignoreStore.restore(draftId, ruleId);
		ignoredRuleIds = deps.ignoreStore.list(draftId);
	}

	// A fix whose diff the editor could not draw yet. Previewing is no longer a
	// step the user takes — selecting a diagnostic shows its fix as a diff — so
	// it stays silent, which means a dropped preview would go unnoticed. The
	// bootstrap handle has no `previewAtomic`, so the card that starts expanded
	// asks for its diff before CodeMirror exists; the request waits here until
	// the real handle arrives. A stale fix is discarded rather than announced —
	// applying it is what has to report the problem.
	let deferredPreview: DiagnosticFix | undefined;

	function showPreview(fix: DiagnosticFix): void {
		if (fix.edit.baseRevision !== deps.snapshot().revision) {
			deferredPreview = undefined;
			return;
		}
		const editor = deps.editor();
		if (!editor.previewAtomic) {
			deferredPreview = fix;
			return;
		}
		deferredPreview = undefined;
		try {
			editor.previewAtomic(fix.edit);
		} catch {
			feedback.announce('The fix could not be previewed in the editor.');
		}
	}

	function visibleIn(diagnostics: readonly Diagnostic[]): Diagnostic[] {
		return diagnostics.filter(
			(diagnostic) =>
				severityFilter.includes(diagnostic.severity) && !ignoredRuleIds.includes(diagnostic.ruleId)
		);
	}

	/**
	 * Mark a diagnostic's card and put the editor's selection — and with it the
	 * active-line wash — on its text, without scrolling deliberately: the
	 * selection's own nearest-edge scroll is enough to keep it on screen.
	 */
	function selectDiagnostic(diagnostic: Diagnostic): EditorHandle {
		const editor = deps.editor();
		editor.clearPreview?.();
		activeDiagnosticKey = diagnosticKey(diagnostic);
		editor.setSelection({ anchor: diagnostic.from, head: diagnostic.to });
		return editor;
	}

	/** Select a diagnostic's range and bring both panel and editor to it. */
	function revealDiagnostic(diagnostic: Diagnostic): EditorHandle {
		// Activating a diagnostic from the editor has to reveal its card, so
		// pull the panel back to the linter tab whatever was showing before.
		activeTab = 'linter';
		const editor = selectDiagnostic(diagnostic);
		// CodeMirror applies queued scroll requests during its measure phase.
		// Reveal last so selection's nearest-edge scroll cannot replace the
		// deliberate upper-third placement.
		editor.revealRange({ from: diagnostic.from, to: diagnostic.to });
		return editor;
	}

	// A fix has been dispatched and the panel is waiting for its re-lint, so it
	// can hand the user to whatever finding comes next. Applying a fix empties
	// the card the user was reading and the panel leads with another one, but
	// nothing in the document said where that one sits — the wash stayed on the
	// line the fix had landed in. It is armed before the dispatch because the
	// editor emits the re-linted snapshot from inside it.
	let leadPending = false;

	return {
		get activeTab() {
			return activeTab;
		},
		get activeDiagnosticKey() {
			return activeDiagnosticKey;
		},
		get severityFilter() {
			return severityFilter;
		},
		get severityFiltersOpen() {
			return severityFiltersOpen;
		},
		get visibleDiagnostics() {
			return visibleIn(deps.snapshot().diagnostics);
		},
		get ignoredRuleIds() {
			return ignoredRuleIds;
		},
		setActiveTab(tab) {
			activeTab = tab;
		},
		toggleSeverity(severity) {
			severityFilter = severityFilter.includes(severity)
				? severityFilter.filter((candidate) => candidate !== severity)
				: allSeverities.filter(
						(candidate) => candidate === severity || severityFilter.includes(candidate)
					);
		},
		toggleSeverityFilters() {
			severityFiltersOpen = !severityFiltersOpen;
			return severityFiltersOpen;
		},
		refreshIgnoredRules() {
			ignoredRuleIds = deps.ignoreStore.list(deps.draftId());
		},
		pruneActiveDiagnostic(diagnostics) {
			if (
				activeDiagnosticKey &&
				!diagnostics.some((diagnostic) => diagnosticKey(diagnostic) === activeDiagnosticKey)
			) {
				activeDiagnosticKey = undefined;
			}
		},
		leadAfterFix(diagnostics) {
			if (!leadPending) return;
			leadPending = false;
			// Whichever tab is showing stays: the press that applied the fix does
			// not also get to choose what panel the user is looking at.
			const next = orderDiagnostics(visibleIn(diagnostics))[0];
			if (next) selectDiagnostic(next);
		},
		navigateToDiagnostic(diagnostic) {
			revealDiagnostic(diagnostic).focus();
		},
		// The pointer resting on an underline in the editor. The panel follows
		// along, but the editor stays put: the reveal in `revealDiagnostic` lifts
		// the line to the upper third, which under a hovering pointer would pull
		// the very text being pointed at out from under it. Whichever tab is
		// showing also stays — a pointer crossing the lyrics may not reach over
		// and change what panel the user chose.
		highlightDiagnostic(diagnostic) {
			activeDiagnosticKey = diagnosticKey(diagnostic);
		},
		chooseSectionHeader(diagnostic) {
			const editor = revealDiagnostic(diagnostic);
			if (editor.requestSectionHeader) {
				editor.requestSectionHeader();
			} else {
				feedback.announce('The section-header picker is unavailable.');
			}
		},
		canAssignDiagnosticPerformers(diagnostic) {
			return resolveLegendAssignment(deps.snapshot().parsed, diagnostic).status === 'available';
		},
		assignDiagnosticPerformers(diagnostic) {
			const editor = revealDiagnostic(diagnostic);
			if (editor.requestPerformerLegendAssignment) {
				editor.requestPerformerLegendAssignment(diagnostic);
			} else {
				feedback.announce('The performer picker is unavailable.');
			}
		},
		previewFix(_diagnostic, fix) {
			showPreview(fix);
		},
		retryFixPreview() {
			if (deferredPreview) showPreview(deferredPreview);
		},
		clearFixPreview() {
			deferredPreview = undefined;
			deps.editor().clearPreview?.();
		},
		applyFix(diagnostic, fix) {
			const editor = deps.editor();
			editor.clearPreview?.();
			activeDiagnosticKey = undefined;
			if (fix.edit.baseRevision !== deps.snapshot().revision) {
				feedback.announce('This fix is stale. Review the current diagnostic before applying it.');
				return;
			}
			leadPending = true;
			try {
				editor.dispatchAtomic(fix.edit);
			} catch (error) {
				leadPending = false;
				throw error;
			}
			feedback.announce(`${fix.label} applied for ${diagnostic.message}.`);
		},
		ignoreRule(ruleId) {
			deps.editor().clearPreview?.();
			activeDiagnosticKey = undefined;
			if (ignoredRuleIds.includes(ruleId)) return;
			setIgnored(ruleId, true);
			const message = `Ignored ${ruleId} for this session.`;
			feedback.announce(message);
			feedback.addToast({
				message,
				actionLabel: 'Undo',
				action: () => {
					setIgnored(ruleId, false);
					feedback.announce(`Restored ${ruleId}.`);
				}
			});
		},
		restoreRule(ruleId) {
			if (!ignoredRuleIds.includes(ruleId)) return;
			setIgnored(ruleId, false);
			const message = `Restored ${ruleId}.`;
			feedback.announce(message);
			feedback.addToast({
				message,
				actionLabel: 'Undo',
				action: () => {
					setIgnored(ruleId, true);
					feedback.announce(`Ignored ${ruleId} again.`);
				}
			});
		}
	};
}
