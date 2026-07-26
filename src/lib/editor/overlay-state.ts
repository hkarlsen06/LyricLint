import type {
	Diagnostic,
	LegendGroupAssignment,
	PerformerId,
	StyleSlot,
	TextRange
} from '$lib/core/types.js';
import type { ScreenRect, SelectionAnchor } from './contracts.js';

/**
 * The legend assignment reached from a `performer.inline-mismatch` diagnostic:
 * the section's plain voice first, then the styled passage. A styled-only
 * section has no plain voice to name, so it runs the `'styled'` step alone.
 */
export interface LegendAssignment {
	sectionFrom: number;
	styleSlot: StyleSlot;
	step: 'section' | 'styled';
	/**
	 * The section is styled all the way through: its one voice belongs in the
	 * plain slot, and the wrappers come off with the assignment. Leaving them
	 * would put an italic group first in the legend with no plain group before
	 * it, which is exactly what `performer.style-order` flags.
	 */
	promoteToPlain?: boolean;
	sectionPerformerIds: readonly PerformerId[];
	styledPerformerIds: readonly PerformerId[];
}

/** The section and slot a legend assignment targets, resolved from the document. */
export interface LegendTarget {
	sectionFrom: number;
	styleSlot: StyleSlot;
	promoteToPlain?: boolean;
}

/**
 * The editor shows at most one anchored overlay at a time. Modelling that as a
 * union rather than a flag per overlay makes the combinations the editor never
 * intends unrepresentable instead of merely untested: two pickers at once, a
 * popover behind a picker, a pending legend step with no picker mounted, or a
 * picker with no range to anchor to.
 */
export type OverlayState =
	| { kind: 'none' }
	| { kind: 'diagnostic'; diagnostic: Diagnostic; takesFocus: boolean }
	| {
			kind: 'performer';
			range: TextRange;
			legend?: LegendAssignment;
			/**
			 * Step two of a selection assignment: the voices already chosen for the
			 * selection, held while the picker asks who sings the rest of the section.
			 * Set only when the assignment would otherwise write a legend that does
			 * not begin at plain — see `assignmentNeedsSectionVoice`.
			 */
			pendingVoice?: readonly PerformerId[];
	  }
	| { kind: 'section'; range: TextRange };

/** The overlay plus the suppression that outlives any single overlay. */
export interface OverlaySession {
	overlay: OverlayState;
	/**
	 * `rangeKey` of a selection whose performer picker the user already
	 * resolved. The selection itself survives dismissal, so the next settled
	 * anchor report would otherwise reopen the card the user just closed.
	 */
	dismissedSelection?: string;
}

/** The resting state: nothing open, nothing suppressed. */
export function closedOverlaySession(): OverlaySession {
	return { overlay: { kind: 'none' } };
}

export function rangeKey(range: TextRange): string {
	return `${range.from}:${range.to}`;
}

/** The document range an overlay anchors to, if one is open. */
export function overlayRange(overlay: OverlayState): TextRange | undefined {
	switch (overlay.kind) {
		case 'none':
			return undefined;
		case 'diagnostic':
			return { from: overlay.diagnostic.from, to: overlay.diagnostic.to };
		default:
			return overlay.range;
	}
}

function withOverlay(session: OverlaySession, overlay: OverlayState): OverlaySession {
	return { ...session, overlay };
}

/**
 * The card opens even with an empty roster: it then offers the inline "+" add
 * flow so assignment never dead-ends on a missing performer.
 */
export function openPerformerPicker(session: OverlaySession, range: TextRange): OverlaySession {
	return withOverlay(session, { kind: 'performer', range });
}

/** Start the legend flow on the diagnostic's own range, at step one of two. */
export function beginLegendAssignment(
	session: OverlaySession,
	range: TextRange,
	legend: LegendAssignment
): OverlaySession {
	return withOverlay(session, { kind: 'performer', range, legend });
}

export function openSectionPicker(session: OverlaySession, range: TextRange): OverlaySession {
	return withOverlay(session, { kind: 'section', range });
}

/**
 * Idempotent by design: hovering an underline re-reports the same diagnostic on
 * every pointer move, and a fresh overlay object each time would re-measure the
 * anchor and re-run the popover's effects while the card sits still.
 */
export function activateDiagnostic(
	session: OverlaySession,
	diagnostic: Diagnostic,
	takesFocus: boolean
): OverlaySession {
	const current = session.overlay;
	if (
		current.kind === 'diagnostic' &&
		current.diagnostic === diagnostic &&
		current.takesFocus === takesFocus
	) {
		return session;
	}
	return withOverlay(session, { kind: 'diagnostic', diagnostic, takesFocus });
}

/** Close whatever is open without recording a dismissal. */
export function closeOverlay(session: OverlaySession): OverlaySession {
	return withOverlay(session, { kind: 'none' });
}

/**
 * Escape from editor focus. The caller reports `dismissed` back to CodeMirror
 * so an Escape that closed nothing still falls through to the default keymap.
 */
export function dismissDiagnostic(session: OverlaySession): {
	session: OverlaySession;
	dismissed: boolean;
} {
	return session.overlay.kind === 'diagnostic'
		? { session: closeOverlay(session), dismissed: true }
		: { session, dismissed: false };
}

/**
 * Cancelling records the range so the settled selection anchor still pointing
 * at it cannot immediately reopen the same card.
 */
export function cancelPerformerPicker(session: OverlaySession): OverlaySession {
	return session.overlay.kind === 'performer'
		? { overlay: { kind: 'none' }, dismissedSelection: rangeKey(session.overlay.range) }
		: closeOverlay(session);
}

/** What applying the performer picker resolves to for the current overlay. */
export type PerformerApplyOutcome =
	/** Step one of the legend flow recorded; the picker stays open for step two. */
	| { kind: 'advance'; session: OverlaySession }
	/**
	 * The legend groups are known and commit as one document edit, together
	 * with any style slots whose markup the assignment removes.
	 */
	| {
			kind: 'legend';
			sectionFrom: number;
			assignments: LegendGroupAssignment[];
			unwrapSlots: StyleSlot[];
	  }
	/**
	 * An ordinary selection assignment over the picker's range.
	 *
	 * `performerIds` rather than whatever the picker just handed back, because
	 * step two hands back the *section's* voice: the selection's own was chosen a
	 * step earlier and is carried on the overlay.
	 */
	| {
			kind: 'range';
			range: TextRange;
			performerIds: readonly PerformerId[];
			sectionPerformerIds?: readonly PerformerId[];
	  }
	/** No performer picker was open, so there is nothing to apply. */
	| { kind: 'none' };

export function applyPerformerPicker(
	session: OverlaySession,
	performerIds: readonly PerformerId[]
): PerformerApplyOutcome {
	const { overlay } = session;
	if (overlay.kind !== 'performer') {
		return { kind: 'none' };
	}
	const { legend, pendingVoice } = overlay;
	// Step two of a selection assignment. An empty answer is the "name them
	// later" way out, and it commits exactly what step one asked for.
	if (pendingVoice) {
		return {
			kind: 'range',
			range: overlay.range,
			performerIds: pendingVoice,
			...(performerIds.length > 0 ? { sectionPerformerIds: [...performerIds] } : {})
		};
	}
	if (legend?.step === 'section') {
		return {
			kind: 'advance',
			session: withOverlay(session, {
				...overlay,
				legend: { ...legend, step: 'styled', sectionPerformerIds: [...performerIds] }
			})
		};
	}
	// A styled-only section names one voice, and it names it as the plain one:
	// the styled slot's markup is dropped in the same edit rather than becoming
	// a legend group that no plain group precedes.
	if (legend?.promoteToPlain) {
		return {
			kind: 'legend',
			sectionFrom: legend.sectionFrom,
			assignments: [{ styleSlot: 1, performerIds: [...performerIds] }],
			unwrapSlots: [legend.styleSlot]
		};
	}
	if (legend) {
		return {
			kind: 'legend',
			sectionFrom: legend.sectionFrom,
			assignments: [
				{ styleSlot: 1, performerIds: [...legend.sectionPerformerIds] },
				{ styleSlot: legend.styleSlot, performerIds: [...performerIds] }
			],
			unwrapSlots: []
		};
	}
	return { kind: 'range', range: overlay.range, performerIds: [...performerIds] };
}

/**
 * Hold the selection's chosen voices and ask who sings the rest of the section.
 *
 * The picker stays mounted and re-keys itself, exactly as the legend flow's two
 * steps do; the assignment commits on the second answer, as one edit.
 */
export function askSectionVoice(
	session: OverlaySession,
	performerIds: readonly PerformerId[]
): OverlaySession {
	return session.overlay.kind === 'performer'
		? withOverlay(session, { ...session.overlay, pendingVoice: [...performerIds] })
		: session;
}

/** The outcomes that produce a document edit and therefore settle afterwards. */
export type CommittedPerformerAssignment = Extract<
	PerformerApplyOutcome,
	{ kind: 'legend' | 'range' }
>;

/**
 * Settle the session after an assignment edit was dispatched (or failed).
 *
 * A range assignment consumed the selection, so it is suppressed exactly like
 * a cancellation. A legend assignment came from a diagnostic rather than from
 * the user's selection, so the selection under it stays eligible.
 */
export function finishPerformerAssignment(
	session: OverlaySession,
	outcome: CommittedPerformerAssignment
): OverlaySession {
	return outcome.kind === 'range'
		? { overlay: { kind: 'none' }, dismissedSelection: rangeKey(outcome.range) }
		: closeOverlay(session);
}

/**
 * A new document revision retires the dismissal: every offset it was keyed to
 * has moved, so the old key can only suppress the wrong selection.
 */
export function forgetDismissedSelection(session: OverlaySession): OverlaySession {
	return session.dismissedSelection === undefined ? session : { overlay: session.overlay };
}

/**
 * A settled selection anchor.
 *
 * `undefined` means there is no anchored selection at all — collapsed,
 * whitespace-only, or composing — which retires the performer picker but
 * leaves a section picker or diagnostic popover alone: neither was opened
 * from the selection.
 */
export function reportSelectionAnchor(
	session: OverlaySession,
	anchor: SelectionAnchor | undefined
): { session: OverlaySession; assignRequested: boolean } {
	if (!anchor) {
		return {
			session: session.overlay.kind === 'performer' ? closeOverlay(session) : session,
			assignRequested: false
		};
	}
	const key = rangeKey(anchor.range);
	const alreadyOpen =
		session.overlay.kind === 'performer' && rangeKey(session.overlay.range) === key;
	if (!anchor.userDriven || key === session.dismissedSelection || alreadyOpen) {
		return { session, assignRequested: false };
	}
	return { session: openPerformerPicker(session, anchor.range), assignRequested: true };
}

/**
 * Once the anchored line leaves the rendered viewport there is nothing
 * meaningful to anchor to, so the popover closes rather than floating free.
 * A popover that held focus has to hand it back to the editor.
 */
export function releaseUnanchoredDiagnostic(session: OverlaySession): {
	session: OverlaySession;
	returnFocus: boolean;
} {
	return session.overlay.kind === 'diagnostic'
		? { session: closeOverlay(session), returnFocus: session.overlay.takesFocus }
		: { session, returnFocus: false };
}

/**
 * The one cache invariant behind every anchored overlay: a reported selection
 * rect is reusable only while it still describes the same range measured at
 * the same scroll position. Scrolling bumps the tick, which is exactly what
 * forces a re-measure from the document instead of a stale screen rect.
 */
export function cachedAnchorRect(
	anchor: SelectionAnchor | undefined,
	range: TextRange,
	scrollTick: number,
	anchorTick: number
): ScreenRect | undefined {
	return anchor && rangeKey(anchor.range) === rangeKey(range) && scrollTick === anchorTick
		? anchor.rect
		: undefined;
}

/**
 * Which side of the range has room. Unlike the rect this survives scrolling:
 * flipping the card from above to below mid-scroll would move it out from
 * under the pointer that opened it.
 */
export function anchorPlacement(
	anchor: SelectionAnchor | undefined,
	range: TextRange
): 'above' | 'below' {
	return anchor && rangeKey(anchor.range) === rangeKey(range) ? anchor.prefer : 'above';
}
