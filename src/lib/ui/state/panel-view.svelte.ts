import { ChangeSet } from '@codemirror/state';
import type {
	AtomicDocumentEdit,
	Diagnostic,
	DiagnosticFix,
	EditorHandle,
	EditorSnapshot,
	RuleContext,
	DraftIgnoreStore,
	Severity,
	TextRange
} from '#lib/core/types.js';
import {
	acceptsDiagnosticAsCorrect,
	diagnosticIgnoreKey,
	matchIgnoredDiagnostics,
	ignoredDiagnosticAccepted,
	ignoredDiagnosticRuleId
} from '#lib/diagnostics/ignore.js';
import {
	countDecisions,
	decisionKey,
	groupDecisions,
	keepOrder,
	type Decision
} from '#lib/diagnostics/decisions.js';
import { diagnosticKey, orderDiagnostics } from '#lib/diagnostics/order.js';
import { diagnosticRowSignature, reconcileDiagnosticRows } from '#lib/diagnostics/row-identity.js';
import { filterProvisionalVerseNumbering } from '#lib/diagnostics/prerequisites.js';
import { resolveLegendAssignment } from '#lib/performers/legend-assignment.js';
import { collectMatchingFixes, mergeFixes, planBulkFix } from '#lib/rules/bulk-fix.js';
import type { BulkFixPlan } from '#lib/rules/bulk-fix.js';
import { ruleName } from '#lib/rules/names.js';
import { NOTICE_TOAST_DURATION, type FeedbackState } from './feedback.svelte.js';

export type RightPanelTab =
	'linter' | 'linking' | 'performers' | 'song' | 'preferences' | 'assistant';

const allSeverities: Severity[] = ['error', 'warning', 'suggestion', 'manual-review'];

interface PanelViewDependencies {
	editor: () => EditorHandle;
	snapshot: () => EditorSnapshot;
	ruleContext: () => RuleContext;
	draftId: () => string;
	ignoreStore: DraftIgnoreStore;
	feedback: FeedbackState;
	initialActiveTab?: RightPanelTab;
	onActiveTabChange?: (tab: RightPanelTab) => void;
	onIgnoredDiagnosticsChange?: () => void;
}

interface PanelView {
	readonly activeTab: RightPanelTab;
	readonly activeDiagnosticKey?: string;
	readonly activeDiagnosticRange?: TextRange;
	readonly severityFilter: readonly Severity[];
	readonly unignoredDiagnostics: readonly Diagnostic[];
	readonly visibleDiagnostics: readonly Diagnostic[];
	/**
	 * The unignored findings as Review's rows, in its reading order, one per
	 * decision. Grouped once per snapshot, because every count of rows (the
	 * badges, the severity chips, the filter notes) reads it.
	 */
	readonly unignoredDecisions: readonly Decision[];
	/**
	 * The rows Review draws: `unignoredDecisions` the severity filters let
	 * through, in the order they were drawn. Rows never reorder on their own;
	 * see `releaseReviewOrder`.
	 */
	readonly reviewDecisions: readonly Decision[];
	/**
	 * What a whole-document bulk fix would settle, and what it would leave. It is
	 * planned over the *visible* diagnostics: a severity chip the user switched
	 * off is a statement about what they want to deal with, and fixing something
	 * a filter is hiding is the one thing bulk fixing must never do.
	 */
	readonly bulkFixPlan: BulkFixPlan;
	readonly ignoredDiagnosticKeys: readonly string[];
	readonly ignoredDiagnosticMatches: ReadonlyMap<string, string>;
	diagnosticRowKey(diagnostic: Diagnostic): string;
	setActiveTab(tab: RightPanelTab): void;
	toggleSeverity(severity: Severity): void;
	/**
	 * Draw Review's rows in rank order again, because the reader changed what it
	 * shows. The panel calls it when Review is shown again after being hidden;
	 * a severity chip, a draft change, and a wholesale replacement release it here.
	 */
	releaseReviewOrder(): void;
	/** Re-read the stored ignores for whichever draft is current now. */
	refreshIgnoredDiagnostics(): void;
	/** Follow surviving occurrences through actual edits, retiring findings that disappeared. */
	adoptSnapshot(previous: EditorSnapshot, next: EditorSnapshot): void;
	/**
	 * Once an applied fix has been re-linted, mark the diagnostic the panel now
	 * leads with and put the editor's line wash on it.
	 */
	leadAfterFix(): void;
	navigateToDiagnostic(
		diagnostic: Diagnostic,
		options?: { focus?: boolean; range?: TextRange }
	): void;
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
	linkDiagnosticSections(diagnostic: Diagnostic): void;
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
	/**
	 * Store an acceptance the user has already given somewhere other than the
	 * card. The picker's unknown-voice chip is the answer `The performer is
	 * unknown`, so the finding it creates arrives answered. Silent, because the
	 * press it rides on already announced; the acceptance still lists among the
	 * ignored findings, restorable like any other.
	 */
	recordAcceptedOccurrence(key: string): void;
	restoreDiagnostic(diagnosticKey: string): void;
	/**
	 * Ask the next snapshot to hand the workbench to its leading finding, for an
	 * edit that did not come from a fix. Replacing the whole document has the
	 * same problem applying a fix does: the panel leads with a diagnostic while
	 * the wash stays wherever the edit left the caret, describing a place the
	 * reader is not looking. `replace` dispatches the edit; if it throws, nothing
	 * stays armed for the next keystroke.
	 */
	leadOnNextSnapshot(replace: () => void): void;
}

export function createPanelView(deps: PanelViewDependencies): PanelView {
	let activeTab = $state<RightPanelTab>(deps.initialActiveTab ?? 'linter');
	let activeDiagnosticKey = $state<string | undefined>();
	let severityFilter = $state<Severity[]>([...allSeverities]);
	let nextRowId = 0;
	const allocateRowKey = () => `finding-${nextRowId++}`;
	let rowKeys = $state.raw<ReadonlyMap<string, string>>(
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- immutable snapshot; replacing the map publishes the complete reconciliation
		new Map(
			deps.snapshot().diagnostics.map((item) => [diagnosticRowSignature(item), allocateRowKey()])
		)
	);

	/**
	 * The set-aside diagnostics, read from the store rather than mirrored beside
	 * it. A cached list only had to be re-read on a draft *change*, which is one
	 * of two ways the store's own contents move: `clearDraft` runs from the draft
	 * store when a 'scribe is discarded or deleted, and discarding an emptied
	 * draft and undoing it never changes which draft is open, so the panel went
	 * on filtering findings against ignores that no longer existed anywhere,
	 * until something else happened to refresh them.
	 *
	 * Deriving it costs a sorted read of a small set on every snapshot, which is
	 * a fraction of the `matchIgnoredDiagnostics` pass already made there. The
	 * three tracked terms are exactly the three ways the answer can change: the
	 * open draft, an edit landing (which is what every path that can empty the
	 * store publishes on its way past), and this panel's own writes.
	 */
	let ignoreEpoch = $state(0);
	const ignoredDiagnosticKeys = $derived.by(() => {
		void ignoreEpoch;
		void deps.snapshot().revision;
		const musixmatch = deps.snapshot().conversion?.profile === 'musixmatch';
		return deps.ignoreStore
			.list(deps.draftId())
			.filter((key) => ignoredDiagnosticRuleId(key).startsWith('mxm.') === musixmatch);
	});
	const ignoredDiagnosticMatches = $derived(
		matchIgnoredDiagnostics(
			deps.snapshot().diagnostics,
			deps.snapshot().text,
			ignoredDiagnosticKeys
		)
	);

	const feedback = deps.feedback;

	function setIgnored(diagnosticKey: string, ignored: boolean, draftId = deps.draftId()): boolean {
		if (draftId !== deps.draftId()) {
			const message = "Open the original 'scribe to undo this finding change.";
			feedback.announce(message);
			feedback.addToast({ message, duration: NOTICE_TOAST_DURATION });
			return false;
		}
		if (ignored) deps.ignoreStore.ignore(draftId, diagnosticKey);
		else deps.ignoreStore.restore(draftId, diagnosticKey);
		ignoreEpoch += 1;
		deps.onIgnoredDiagnosticsChange?.();
		return true;
	}

	function setActiveTab(tab: RightPanelTab): void {
		if (activeTab === tab) return;
		activeTab = tab;
		deps.onActiveTabChange?.(tab);
	}

	// A fix whose diff the editor could not draw yet. Previewing is no longer a
	// step the user takes (selecting a diagnostic shows its fix as a diff), so
	// it stays silent, which means a dropped preview would go unnoticed. The
	// bootstrap handle has no `previewAtomic`, so the card that starts expanded
	// asks for its diff before CodeMirror exists; the request waits here until
	// the real handle arrives. A stale fix is discarded rather than announced:
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

	const unignoredDiagnostics = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local membership index; the complete filtered result is derived
		const ignored = new Set(ignoredDiagnosticMatches.values());
		const unignored = deps
			.snapshot()
			.diagnostics.filter((diagnostic) => !ignored.has(diagnosticKey(diagnostic)));
		return filterProvisionalVerseNumbering(unignored, deps.snapshot().parsed, deps.ruleContext());
	});
	const visibleDiagnostics = $derived(
		unignoredDiagnostics.filter((diagnostic) => severityFilter.includes(diagnostic.severity))
	);
	const bulkFixPlan = $derived(planBulkFix(visibleDiagnostics));

	function diagnosticRowKey(diagnostic: Diagnostic): string {
		const signature = diagnosticRowSignature(diagnostic);
		return rowKeys.get(signature) ?? signature;
	}

	// A decision never straddles a severity, so filtering the grouped rows is the
	// same as grouping the filtered findings.
	const unignoredDecisions = $derived(
		groupDecisions(orderDiagnostics(unignoredDiagnostics), diagnosticRowKey)
	);
	// A row sorts by its first place, so a ranked list would move whenever a
	// place was answered, from the panel or anywhere else. The drawn order is
	// kept instead, and released when the reader changes what the list shows.
	// It remembers each distinct row drawn since that release and no more.
	let orderRelease = $state(0);
	let releaseOnNextSnapshot = false;
	let drawnOrder: { release: number; remembered: readonly Decision[] } | undefined;
	const reviewDecisions = $derived.by(() => {
		const ranked = unignoredDecisions.filter((decision) =>
			severityFilter.includes(decision.members[0]!.severity)
		);
		const kept = keepOrder(
			ranked,
			drawnOrder?.release === orderRelease ? drawnOrder.remembered : []
		);
		drawnOrder = { release: orderRelease, remembered: kept.remembered };
		return kept.rows;
	});

	// Review keeps the aimed occurrence without changing the finding's identity.
	// Repeated card navigation and guided actions resolve the same validated range.
	let aimedOccurrence = $state.raw<{ key: string; range: TextRange } | undefined>();

	function occurrenceRange(diagnostic: Diagnostic): TextRange {
		const aimed = aimedOccurrence;
		if (
			aimed?.key === diagnosticKey(diagnostic) &&
			[diagnostic, ...(diagnostic.relatedRanges ?? [])].some(
				(range) => range.from === aimed.range.from && range.to === aimed.range.to
			)
		)
			return aimed.range;
		return diagnostic;
	}

	/**
	 * Mark a diagnostic's card and put the editor's selection, and with it the
	 * active-line wash, on its text, without scrolling deliberately: the
	 * selection's own nearest-edge scroll is enough to keep it on screen.
	 *
	 * It does not clear the preview. Selecting a diagnostic is what *shows* a
	 * diff, and the card mounting is what asks for it, so clearing here undid
	 * the request whenever the card was already open on this diagnostic, which is
	 * every press on an expanded card's own row. The outgoing card's own unmount
	 * is what retires a diff that nothing wants any more.
	 */
	function selectDiagnostic(diagnostic: Diagnostic): EditorHandle {
		const editor = deps.editor();
		activeDiagnosticKey = diagnosticKey(diagnostic);
		const range = occurrenceRange(diagnostic);
		editor.setSelection({ anchor: range.from, head: range.to });
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
		const range = occurrenceRange(diagnostic);
		editor.revealRange({ from: range.from, to: range.to });
		return editor;
	}

	// A fix has been dispatched and the panel is waiting for its re-lint, so it
	// can hand the user to whatever finding comes next. Applying a fix empties
	// the card the user was reading and the panel leads with another one, but
	// nothing in the document said where that one sits, so the wash stayed on the
	// line the fix had landed in. It is armed before the dispatch because the
	// editor emits the re-linted snapshot from inside it.
	let leadPending = false;
	let passageFrom: number | undefined;
	// The decision whose place was just answered. Its row stays open, so the lead
	// is its next place in document order before anything else in the list.
	let leadDecision: { key: string; from: number } | undefined;

	function answeredDecision(diagnostic: Diagnostic, from = diagnostic.from) {
		const key = decisionKey(diagnostic);
		return key === null ? undefined : { key, from };
	}

	// Read from the rows as drawn, so the lead after a row leaves is the one the
	// list shows next rather than the one a fresh sort would.
	function nextInReview(): Diagnostic | undefined {
		const rows = reviewDecisions;
		const decision = leadDecision;
		leadDecision = undefined;
		if (decision) {
			const places = rows.find((row) => row.key === decision.key)?.members ?? [];
			const next = places.find((item) => item.from >= decision.from) ?? places[0];
			if (next) return next;
		}
		const lead = rows[0]?.members[0];
		const from = passageFrom;
		if (from === undefined) return lead;
		return (
			rows
				.flatMap((row) => row.members)
				.sort((a, b) => a.from - b.from)
				.find((item) => item.from >= from) ?? lead
		);
	}

	/**
	 * The one path from a decided edit to the document. Everything that applies
	 * a fix (one, a batch of identical ones, or the whole safe set) arrives
	 * here, so the staleness guard, the abandoned preview, and the hand-off to
	 * the next finding cannot be got right in one place and forgotten in another.
	 */
	function dispatchFixEdit(
		edit: AtomicDocumentEdit | undefined,
		announcement: string,
		answered?: Diagnostic
	): void {
		const editor = deps.editor();
		editor.clearPreview?.();
		activeDiagnosticKey = undefined;
		leadDecision = undefined;
		if (!edit || edit.baseRevision !== deps.snapshot().revision) {
			feedback.announce('This fix is stale. Review the current diagnostic before applying it.');
			return;
		}
		const mapPos = (pos: number) =>
			ChangeSet.of(edit.edits, deps.snapshot().text.length).mapPos(pos, -1);
		if (passageFrom !== undefined) passageFrom = mapPos(passageFrom);
		if (answered) leadDecision = answeredDecision(answered, mapPos(answered.from));
		leadPending = true;
		try {
			editor.dispatchAtomic(edit);
		} catch (error) {
			leadPending = false;
			leadDecision = undefined;
			throw error;
		}
		feedback.announce(announcement);
	}

	function matchingFixes(diagnostic: Diagnostic, fix: DiagnosticFix): DiagnosticFix[] {
		return collectMatchingFixes(visibleDiagnostics, diagnostic, fix);
	}

	return {
		get activeTab() {
			return activeTab;
		},
		get activeDiagnosticKey() {
			return activeDiagnosticKey;
		},
		get activeDiagnosticRange() {
			return aimedOccurrence?.key === activeDiagnosticKey ? aimedOccurrence?.range : undefined;
		},
		get severityFilter() {
			return severityFilter;
		},
		get unignoredDiagnostics() {
			return unignoredDiagnostics;
		},
		get visibleDiagnostics() {
			return visibleDiagnostics;
		},
		get unignoredDecisions() {
			return unignoredDecisions;
		},
		get reviewDecisions() {
			return reviewDecisions;
		},
		get bulkFixPlan() {
			return bulkFixPlan;
		},
		get ignoredDiagnosticKeys() {
			return ignoredDiagnosticKeys;
		},
		get ignoredDiagnosticMatches() {
			return ignoredDiagnosticMatches;
		},
		diagnosticRowKey,
		setActiveTab(tab) {
			setActiveTab(tab);
		},
		toggleSeverity(severity) {
			orderRelease += 1;
			severityFilter = severityFilter.includes(severity)
				? severityFilter.filter((candidate) => candidate !== severity)
				: allSeverities.filter(
						(candidate) => candidate === severity || severityFilter.includes(candidate)
					);
		},
		releaseReviewOrder() {
			orderRelease += 1;
		},
		refreshIgnoredDiagnostics() {
			orderRelease += 1;
			aimedOccurrence = undefined;
			passageFrom = undefined;
			leadDecision = undefined;
			activeDiagnosticKey = undefined;
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- immutable snapshot, reset when changing drafts
			rowKeys = new Map();
			ignoreEpoch += 1;
		},
		adoptSnapshot(previous, next) {
			if (releaseOnNextSnapshot) {
				releaseOnNextSnapshot = false;
				orderRelease += 1;
			}
			const diagnostics = next.diagnostics;
			if (
				previous.text !== next.text ||
				previous.diagnostics !== diagnostics ||
				rowKeys.size === 0
			) {
				const reconciled = reconcileDiagnosticRows(previous, next, rowKeys, allocateRowKey);
				rowKeys = reconciled.keys;
				if (activeDiagnosticKey) activeDiagnosticKey = reconciled.remapped.get(activeDiagnosticKey);
				if (aimedOccurrence) {
					const key = reconciled.remapped.get(aimedOccurrence.key);
					const range = reconciled.mapRange(aimedOccurrence.range);
					aimedOccurrence = key && range ? { key, range } : undefined;
				}
			}
			if (aimedOccurrence) {
				const current = diagnostics.find((item) => diagnosticKey(item) === aimedOccurrence?.key);
				if (!current || occurrenceRange(current) !== aimedOccurrence.range)
					aimedOccurrence = undefined;
			}
			if (
				activeDiagnosticKey &&
				!diagnostics.some((diagnostic) => diagnosticKey(diagnostic) === activeDiagnosticKey)
			) {
				activeDiagnosticKey = undefined;
			}
		},
		leadAfterFix() {
			if (!leadPending) return;
			leadPending = false;
			// Whichever tab is showing stays: the press that applied the fix does
			// not also get to choose what panel the user is looking at.
			const next = nextInReview();
			if (next) selectDiagnostic(next);
		},
		navigateToDiagnostic(diagnostic, options) {
			const key = diagnosticKey(diagnostic);
			if (options?.range) aimedOccurrence = { key, range: options.range };
			else if (aimedOccurrence?.key !== key) aimedOccurrence = undefined;
			passageFrom = occurrenceRange(diagnostic).from;
			const editor = revealDiagnostic(diagnostic);
			if (options?.focus !== false) editor.focus();
		},
		// The pointer resting on an underline in the editor. The panel follows
		// along, but the editor stays put: the reveal in `revealDiagnostic` lifts
		// the line to the upper third, which under a hovering pointer would pull
		// the very text being pointed at out from under it. Whichever tab is
		// showing also stays: a pointer crossing the lyrics may not reach over
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
		// Revealing selects the diagnostic's range, which is the header itself, so
		// the command the keyboard already has resolves the same group from the
		// same predicate. Nothing here decides what is linkable a second time.
		linkDiagnosticSections(diagnostic) {
			const editor = revealDiagnostic(diagnostic);
			if (editor.requestSectionLink) {
				editor.requestSectionLink();
			} else {
				feedback.announce('The section-link picker is unavailable.');
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
			if (passageFrom !== undefined) passageFrom = diagnostic.from;
			dispatchFixEdit(fix.edit, `${fix.label} applied for ${diagnostic.message}.`, diagnostic);
		},
		fixBatchSize(diagnostic, fix) {
			return matchingFixes(diagnostic, fix).length;
		},
		applyFixBatch(diagnostic, fix) {
			const fixes = matchingFixes(diagnostic, fix);
			// The batch collapsed to the fix it started from, because a re-lint can remove
			// its siblings between the render and the press. Applying it alone is
			// what the user asked for either way.
			if (fixes.length <= 1) {
				dispatchFixEdit(fix.edit, `${fix.label} applied for ${diagnostic.message}.`, diagnostic);
				return;
			}
			dispatchFixEdit(mergeFixes(fixes), `${fix.label} applied to ${fixes.length} findings.`);
		},
		applyBulkFix() {
			const plan = bulkFixPlan;
			if (plan.fixes.length === 0) {
				feedback.announce('No issues can be fixed automatically.');
				return;
			}
			const fixed = `Fixed ${plan.automatic} ${plan.automatic === 1 ? 'issue' : 'issues'} automatically.`;
			const left = countDecisions(plan.remaining);
			dispatchFixEdit(
				mergeFixes(plan.fixes),
				left === 0 ? fixed : `${fixed} ${left} ${left === 1 ? 'decision' : 'decisions'} left.`
			);
		},
		ignoreDiagnostic(diagnostic) {
			const draftId = deps.draftId();
			deps.editor().clearPreview?.();
			activeDiagnosticKey = undefined;
			const key = diagnosticIgnoreKey(diagnostic, deps.snapshot().text);
			if (ignoredDiagnosticKeys.includes(key)) return;
			setIgnored(key, true);
			if (passageFrom !== undefined) passageFrom = diagnostic.from;
			leadDecision = answeredDecision(diagnostic);
			const next = nextInReview();
			if (next) selectDiagnostic(next);
			// The suppression is the same either way; what the reader answered is
			// not, and a card that led with `It's correct` must not report back that
			// the finding was ignored.
			const accepted = acceptsDiagnosticAsCorrect(diagnostic);
			const message = accepted
				? `Marked this “${ruleName(diagnostic.ruleId)}” diagnostic as correct for this 'scribe.`
				: `Ignored this “${ruleName(diagnostic.ruleId)}” diagnostic for this 'scribe.`;
			feedback.announce(message);
			feedback.addToast({
				message: accepted
					? `“${ruleName(diagnostic.ruleId)}” is correct.`
					: `Ignored “${ruleName(diagnostic.ruleId)}”.`,
				groupKey: JSON.stringify([draftId, diagnostic.ruleId, accepted ? 'accept' : 'ignore']),
				actionLabel: 'Undo',
				action: () => {
					if (!setIgnored(key, false, draftId)) return;
					feedback.announce(`Restored “${ruleName(diagnostic.ruleId)}”.`);
				}
			});
		},
		leadOnNextSnapshot(replace) {
			const place = { aimedOccurrence, passageFrom, leadDecision };
			releaseOnNextSnapshot = true;
			aimedOccurrence = undefined;
			passageFrom = undefined;
			leadDecision = undefined;
			leadPending = true;
			try {
				replace();
			} catch (error) {
				releaseOnNextSnapshot = false;
				leadPending = false;
				({ aimedOccurrence, passageFrom, leadDecision } = place);
				throw error;
			}
		},
		recordAcceptedOccurrence(key) {
			if (ignoredDiagnosticKeys.includes(key)) return;
			setIgnored(key, true);
		},
		restoreDiagnostic(key) {
			if (!ignoredDiagnosticKeys.includes(key)) return;
			const draftId = deps.draftId();
			setIgnored(key, false);
			const message = `Restored “${ruleName(ignoredDiagnosticRuleId(key))}”.`;
			feedback.announce(message);
			feedback.addToast({
				message,
				groupKey: JSON.stringify([draftId, ignoredDiagnosticRuleId(key), 'restore']),
				actionLabel: 'Undo',
				action: () => {
					if (!setIgnored(key, true, draftId)) return;
					// The key says which question was answered, so undoing a restore
					// puts back the answer that was given rather than an ignore.
					feedback.announce(
						ignoredDiagnosticAccepted(key)
							? `Marked this diagnostic as correct again.`
							: `Ignored this diagnostic again.`
					);
				}
			});
		}
	};
}
