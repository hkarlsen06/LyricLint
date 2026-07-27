import type {
	AtomicDocumentEdit,
	Diagnostic,
	DiagnosticFix,
	EditorHandle,
	EditorSnapshot,
	SessionIgnoreStore,
	Severity
} from '$lib/core/types.js';
import {
	diagnosticIgnoreKey,
	matchIgnoredDiagnostics,
	ignoredDiagnosticRuleId
} from '$lib/diagnostics/ignore.js';
import { diagnosticKey, orderDiagnostics } from '$lib/diagnostics/order.js';
import { resolveLegendAssignment } from '$lib/performers/legend-assignment.js';
import { collectMatchingFixes, mergeFixes, planBulkFix } from '$lib/rules/bulk-fix.js';
import type { BulkFixPlan } from '$lib/rules/bulk-fix.js';
import { ruleName } from '$lib/rules/reference.js';
import type { FeedbackState } from './feedback.svelte.js';

export type RightPanelTab = 'linter' | 'performers' | 'tools';

const allSeverities: Severity[] = ['error', 'warning', 'suggestion', 'manual-review'];

export interface PanelViewDependencies {
	editor: () => EditorHandle;
	snapshot: () => EditorSnapshot;
	draftId: () => string;
	ignoreStore: SessionIgnoreStore;
	feedback: FeedbackState;
	initialActiveTab?: RightPanelTab;
	onActiveTabChange?: (tab: RightPanelTab) => void;
	onIgnoredDiagnosticsChange?: () => void;
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
	readonly unignoredDiagnostics: readonly Diagnostic[];
	readonly visibleDiagnostics: readonly Diagnostic[];
	/**
	 * What a whole-document bulk fix would settle, and what it would leave. It is
	 * planned over the *visible* diagnostics: a severity chip the user switched
	 * off is a statement about what they want to deal with, and fixing something
	 * a filter is hiding is the one thing bulk fixing must never do.
	 */
	readonly bulkFixPlan: BulkFixPlan;
	readonly ignoredDiagnosticKeys: readonly string[];
	setActiveTab(tab: RightPanelTab): void;
	toggleSeverity(severity: Severity): void;
	/** Show or hide the severity chips; returns the state it settled on. */
	toggleSeverityFilters(): boolean;
	/** Re-read the session ignores for whichever draft is current now. */
	refreshIgnoredDiagnostics(): void;
	/** Forget ignored occurrences that no longer exist in a settled lint result. */
	pruneIgnoredDiagnostics(diagnostics: readonly Diagnostic[]): void;
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
	/**
	 * How many findings this exact fix would settle, counting the one it came
	 * from. A card offers its batch only above 1, so the count is also the test
	 * for whether the control exists at all.
	 */
	fixBatchSize(diagnostic: Diagnostic, fix: DiagnosticFix): number;
	/** Apply every visible occurrence of this exact fix as one edit. */
	applyFixBatch(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	/** Apply every safe fix the panel is showing as one edit. */
	applyBulkFix(): void;
	ignoreDiagnostic(diagnostic: Diagnostic): void;
	restoreDiagnostic(diagnosticKey: string): void;
	/**
	 * Ask the next snapshot to hand the workbench to its leading finding, for an
	 * edit that did not come from a fix. Replacing the whole document has the
	 * same problem applying a fix does: the panel leads with a diagnostic while
	 * the wash stays wherever the edit left the caret, describing a place the
	 * reader is not looking.
	 */
	leadOnNextSnapshot(): void;
}

export function createPanelView(deps: PanelViewDependencies): PanelView {
	let activeTab = $state<RightPanelTab>(deps.initialActiveTab ?? 'linter');
	let activeDiagnosticKey = $state<string | undefined>();
	let severityFilter = $state<Severity[]>([...allSeverities]);
	let severityFiltersOpen = $state(false);
	let ignoredDiagnosticKeys = $state<string[]>(deps.ignoreStore.list(deps.draftId()));

	const feedback = deps.feedback;

	function setIgnored(diagnosticKey: string, ignored: boolean): void {
		const draftId = deps.draftId();
		if (ignored) deps.ignoreStore.ignore(draftId, diagnosticKey);
		else deps.ignoreStore.restore(draftId, diagnosticKey);
		ignoredDiagnosticKeys = deps.ignoreStore.list(draftId);
		deps.onIgnoredDiagnosticsChange?.();
	}

	function setActiveTab(tab: RightPanelTab): void {
		if (activeTab === tab) return;
		activeTab = tab;
		deps.onActiveTabChange?.(tab);
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

	function unignoredIn(diagnostics: readonly Diagnostic[]): Diagnostic[] {
		const ignored = [
			...matchIgnoredDiagnostics(diagnostics, deps.snapshot().text, ignoredDiagnosticKeys).values()
		];
		return diagnostics.filter((diagnostic) => !ignored.includes(diagnosticKey(diagnostic)));
	}

	function visibleIn(diagnostics: readonly Diagnostic[]): Diagnostic[] {
		return unignoredIn(diagnostics).filter((diagnostic) =>
			severityFilter.includes(diagnostic.severity)
		);
	}

	/**
	 * Mark a diagnostic's card and put the editor's selection — and with it the
	 * active-line wash — on its text, without scrolling deliberately: the
	 * selection's own nearest-edge scroll is enough to keep it on screen.
	 *
	 * It does not clear the preview. Selecting a diagnostic is what *shows* a
	 * diff, and the card mounting is what asks for it — so clearing here undid
	 * the request whenever the card was already open on this diagnostic, which is
	 * every press on an expanded card's own row. The outgoing card's own unmount
	 * is what retires a diff that nothing wants any more.
	 */
	function selectDiagnostic(diagnostic: Diagnostic): EditorHandle {
		const editor = deps.editor();
		activeDiagnosticKey = diagnosticKey(diagnostic);
		editor.setSelection({ anchor: diagnostic.from, head: diagnostic.to });
		return editor;
	}

	/** Select a diagnostic's range and bring both panel and editor to it. */
	function revealDiagnostic(diagnostic: Diagnostic): EditorHandle {
		// Activating a diagnostic from the editor has to reveal its card, so
		// pull the panel back to the linter tab whatever was showing before.
		setActiveTab('linter');
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

	/**
	 * The one path from a decided edit to the document. Everything that applies
	 * a fix — one, a batch of identical ones, or the whole safe set — arrives
	 * here, so the staleness guard, the abandoned preview, and the hand-off to
	 * the next finding cannot be got right in one place and forgotten in another.
	 */
	function dispatchFixEdit(edit: AtomicDocumentEdit | undefined, announcement: string): void {
		const editor = deps.editor();
		editor.clearPreview?.();
		activeDiagnosticKey = undefined;
		if (!edit || edit.baseRevision !== deps.snapshot().revision) {
			feedback.announce('This fix is stale. Review the current diagnostic before applying it.');
			return;
		}
		leadPending = true;
		try {
			editor.dispatchAtomic(edit);
		} catch (error) {
			leadPending = false;
			throw error;
		}
		feedback.announce(announcement);
	}

	function bulkPlan(): BulkFixPlan {
		return planBulkFix(visibleIn(deps.snapshot().diagnostics));
	}

	function matchingFixes(diagnostic: Diagnostic, fix: DiagnosticFix): DiagnosticFix[] {
		return collectMatchingFixes(visibleIn(deps.snapshot().diagnostics), diagnostic, fix);
	}

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
		get unignoredDiagnostics() {
			return unignoredIn(deps.snapshot().diagnostics);
		},
		get visibleDiagnostics() {
			return visibleIn(deps.snapshot().diagnostics);
		},
		get bulkFixPlan() {
			return bulkPlan();
		},
		get ignoredDiagnosticKeys() {
			return ignoredDiagnosticKeys;
		},
		setActiveTab(tab) {
			setActiveTab(tab);
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
		refreshIgnoredDiagnostics() {
			ignoredDiagnosticKeys = deps.ignoreStore.list(deps.draftId());
		},
		pruneIgnoredDiagnostics(diagnostics) {
			const current = matchIgnoredDiagnostics(
				diagnostics,
				deps.snapshot().text,
				ignoredDiagnosticKeys
			);
			const stale = ignoredDiagnosticKeys.filter((key) => !current.has(key));
			if (stale.length === 0) return;
			const draftId = deps.draftId();
			for (const key of stale) deps.ignoreStore.restore(draftId, key);
			ignoredDiagnosticKeys = deps.ignoreStore.list(draftId);
			deps.onIgnoredDiagnosticsChange?.();
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
			dispatchFixEdit(fix.edit, `${fix.label} applied for ${diagnostic.message}.`);
		},
		fixBatchSize(diagnostic, fix) {
			return matchingFixes(diagnostic, fix).length;
		},
		applyFixBatch(diagnostic, fix) {
			const fixes = matchingFixes(diagnostic, fix);
			// The batch collapsed to the fix it started from — a re-lint can remove
			// its siblings between the render and the press. Applying it alone is
			// what the user asked for either way.
			if (fixes.length <= 1) {
				dispatchFixEdit(fix.edit, `${fix.label} applied for ${diagnostic.message}.`);
				return;
			}
			dispatchFixEdit(mergeFixes(fixes), `${fix.label} applied to ${fixes.length} findings.`);
		},
		applyBulkFix() {
			const plan = bulkPlan();
			if (plan.fixes.length === 0) {
				feedback.announce('No issues can be fixed automatically.');
				return;
			}
			const fixed = `Fixed ${plan.automatic} ${plan.automatic === 1 ? 'issue' : 'issues'} automatically.`;
			dispatchFixEdit(
				mergeFixes(plan.fixes),
				plan.manual === 0 ? fixed : `${fixed} ${plan.manual} still need a decision.`
			);
		},
		ignoreDiagnostic(diagnostic) {
			deps.editor().clearPreview?.();
			activeDiagnosticKey = undefined;
			const key = diagnosticIgnoreKey(diagnostic, deps.snapshot().text);
			if (ignoredDiagnosticKeys.includes(key)) return;
			setIgnored(key, true);
			const message = `Ignored this “${ruleName(diagnostic.ruleId)}” diagnostic for this session.`;
			feedback.announce(message);
			feedback.addToast({
				message,
				actionLabel: 'Undo',
				action: () => {
					setIgnored(key, false);
					feedback.announce(`Restored “${ruleName(diagnostic.ruleId)}”.`);
				}
			});
		},
		leadOnNextSnapshot() {
			leadPending = true;
		},
		restoreDiagnostic(key) {
			if (!ignoredDiagnosticKeys.includes(key)) return;
			setIgnored(key, false);
			const message = `Restored “${ruleName(ignoredDiagnosticRuleId(key))}”.`;
			feedback.announce(message);
			feedback.addToast({
				message,
				actionLabel: 'Undo',
				action: () => {
					setIgnored(key, true);
					feedback.announce(`Ignored this diagnostic again.`);
				}
			});
		}
	};
}
