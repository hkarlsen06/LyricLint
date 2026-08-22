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
type OverlayState =
	| { kind: 'none' }
	| {
			kind: 'diagnostic';
			diagnostic: Diagnostic;
			takesFocus: boolean;
			/** The particular primary or related occurrence that opened the popover. */
			anchorRange?: TextRange;
	  }
	| {
			kind: 'performer';
			range: TextRange;
			/**
			 * Whether the card may take the focus as it opens, exactly as the
			 * diagnostic popover's own `takesFocus` decides. A card the user asked
			 * for — `Ctrl-Alt-P`, or a legend action pressed in a diagnostic — is
			 * theirs to drive, so it takes focus and answers Enter. The card that
			 * opens itself off a pointer selection has not been asked for anything,
			 * and taking the focus there is the bug this flag exists for: a
			 * double-click selects a word, the picker mounts, the caret leaves the
			 * document, and the keystroke meant to replace the word lands nowhere.
			 */
			takesFocus: boolean;
			legend?: LegendAssignment;
			/**
			 * Step two of a selection assignment: the voices already chosen for the
			 * selection, held while the picker asks who sings the rest of the section.
			 * Set only when the assignment would otherwise write a legend that does
			 * not begin at plain — see `assignmentNeedsSectionVoice`.
			 */
			pendingVoice?: readonly PerformerId[];
	  }
	| { kind: 'section'; range: TextRange }
	| {
			kind: 'link';
			/**
			 * The selection that opened the card, not the header it names. The
			 * dismissal that keeps a closed card from reopening is keyed to the
			 * selection still sitting there, so the two have to be the same range.
			 */
			range: TextRange;
			/**
			 * Whether the card may take the focus as it opens, exactly as the two
			 * variants above decide it. `Mod-Shift-L`, the diagnostic's guided
			 * action, and a press on the `⇄` marker are all asked for and take it.
			 * The two that open uninvited do not: the marker's own hover wait, and
			 * a pointer selection that happens to cover a header whole. Taking it
			 * there blurred the editor — the drawn caret goes with `.cm-focused` —
			 * and sent the next keystrokes into checkboxes where Space toggles
			 * link membership.
			 */
			takesFocus: boolean;
			/** Lyrics selected for a local replacement or a new link difference. */
			selection?: TextRange;
			/** The header's own offset, which is what every link hook is keyed to. */
			headerFrom: number;
	  };

/** The overlay plus the suppression that outlives any single overlay. */
export interface OverlaySession {
	overlay: OverlayState;
	/**
	 * `rangeKey` of a selection whose performer picker the user already
	 * resolved. While that selection remains standing, the next settled anchor
	 * report would otherwise reopen the card the user just closed.
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
		case 'diagnostic': {
			if (overlay.anchorRange) {
				return overlay.anchorRange;
			}
			const diagnostic = overlay.diagnostic;
			return diagnostic.from === diagnostic.to && diagnostic.relatedRanges?.[0]
				? diagnostic.relatedRanges[0]
				: { from: diagnostic.from, to: diagnostic.to };
		}
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
export function openPerformerPicker(
	session: OverlaySession,
	range: TextRange,
	takesFocus: boolean
): OverlaySession {
	return withOverlay(session, { kind: 'performer', range, takesFocus });
}

/**
 * Start the legend flow on the diagnostic's own range, at step one of two.
 *
 * It takes focus: the press that reached it was a control in a diagnostic card,
 * which had already blurred the editor, so there is no caret here to protect.
 */
export function beginLegendAssignment(
	session: OverlaySession,
	range: TextRange,
	legend: LegendAssignment
): OverlaySession {
	return withOverlay(session, { kind: 'performer', range, takesFocus: true, legend });
}

export function openSectionPicker(session: OverlaySession, range: TextRange): OverlaySession {
	return withOverlay(session, { kind: 'section', range });
}

export function openSectionLinkPicker(
	session: OverlaySession,
	range: TextRange,
	headerFrom: number,
	takesFocus: boolean,
	selection?: TextRange
): OverlaySession {
	return withOverlay(session, { kind: 'link', range, headerFrom, takesFocus, selection });
}

/**
 * Cancelling records the range, exactly as the performer picker's does: the
 * header is still selected after the card closes, and the next settled anchor
 * report would otherwise reopen what the user just dismissed.
 */
export function cancelSectionLinkPicker(session: OverlaySession): OverlaySession {
	return session.overlay.kind === 'link'
		? { overlay: { kind: 'none' }, dismissedSelection: rangeKey(session.overlay.range) }
		: closeOverlay(session);
}

/**
 * Idempotent by design: hovering an underline re-reports the same diagnostic on
 * every pointer move, and a fresh overlay object each time would re-measure the
 * anchor and re-run the popover's effects while the card sits still.
 */
export function activateDiagnostic(
	session: OverlaySession,
	diagnostic: Diagnostic,
	takesFocus: boolean,
	anchorRange?: TextRange
): OverlaySession {
	const current = session.overlay;
	if (
		current.kind === 'diagnostic' &&
		current.diagnostic === diagnostic &&
		current.takesFocus === takesFocus &&
		(current.anchorRange === anchorRange ||
			(current.anchorRange !== undefined &&
				anchorRange !== undefined &&
				rangeKey(current.anchorRange) === rangeKey(anchorRange)))
	) {
		return session;
	}
	const overlay: Extract<OverlayState, { kind: 'diagnostic' }> = {
		kind: 'diagnostic',
		diagnostic,
		takesFocus
	};
	if (anchorRange) overlay.anchorRange = anchorRange;
	return withOverlay(session, overlay);
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
type PerformerApplyOutcome =
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
		const outcome: Extract<PerformerApplyOutcome, { kind: 'range' }> = {
			kind: 'range',
			range: overlay.range,
			performerIds: pendingVoice
		};
		if (performerIds.length > 0) outcome.sectionPerformerIds = [...performerIds];
		return outcome;
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
type CommittedPerformerAssignment = Extract<PerformerApplyOutcome, { kind: 'legend' | 'range' }>;

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
 * What a settled anchor report leaves behind: the session it produced, and
 * whether the shell has an assignment to arbitrate. Only the performer picker
 * ever raises the second — a link needs nothing from the shell.
 */
export interface SelectionAnchorOutcome {
	session: OverlaySession;
	assignRequested: boolean;
}

/**
 * A settled selection anchor.
 *
 * `undefined` means there is no anchored selection at all — collapsed,
 * whitespace-only, or composing — which retires the two cards that opened
 * themselves from a selection (the performer picker and the link picker) but
 * leaves a section picker or diagnostic popover alone: neither was opened
 * from the selection.
 *
 * An anchor that does not offer an assignment still reports its geometry and
 * still leaves an open picker standing. It is not a selection going away, it is
 * a selection this surface has nothing to say about, and closing on it would
 * shut the card the user is answering the moment they reached past it.
 */
export function reportSelectionAnchor(
	session: OverlaySession,
	anchor: SelectionAnchor | undefined
): SelectionAnchorOutcome {
	const openedFromSelection =
		session.overlay.kind === 'performer' || session.overlay.kind === 'link';
	// Only the performer picker goes. It exists solely because a range of lyrics
	// is selected, so a selection that is gone is a card describing nothing. The
	// link picker is anchored to a *header*, which is still there — and it opens
	// from a bare caret too, through `Mod-Shift-L`, so retiring it here killed the
	// keyboard-opened card on the very next settle. It leaves the way every other
	// transient surface does: Escape, Cancel, an outside press, or applying.
	if (!anchor) {
		// A dismissal suppresses only the selection that is still standing behind
		// the card. Once the selection collapses there is no stale anchor report
		// left to guard against, and keeping the key would make selecting the exact
		// same passage later silently fail to open the picker.
		const settled = forgetDismissedSelection(session);
		return {
			session: settled.overlay.kind === 'performer' ? closeOverlay(settled) : settled,
			assignRequested: false
		};
	}
	const key = rangeKey(anchor.range);
	// Moving to any other range retires the old dismissal for the same reason:
	// returning to that text is a new selection gesture, not the settled report
	// from the Cancel press that the suppression exists to absorb.
	const settled = key === session.dismissedSelection ? session : forgetDismissedSelection(session);
	const alreadyOpen =
		openedFromSelection && rangeKey(overlayRange(settled.overlay) ?? anchor.range) === key;
	if (key === session.dismissedSelection || alreadyOpen) {
		return { session: settled, assignRequested: false };
	}
	// `false`: this is the one path nobody pressed. The selection under it is
	// live text the user is in the middle of working on — most often a
	// double-clicked word they are about to type over — so the card draws itself
	// beside the caret and leaves it exactly where it was.
	if (anchor.offersAssignment) {
		return { session: openPerformerPicker(settled, anchor.range, false), assignRequested: true };
	}
	// No `assignRequested`: the shell has nothing to arbitrate about a link, so
	// there is no request to forward. The pane opens the card and that is all.
	if (anchor.linkHeader) {
		// `false` for the same reason the picker above takes it: nobody pressed
		// anything. Sweeping a header whole is a selection the user is in the
		// middle of working with, and a card that took the caret out of the
		// document there would land their next keystroke in a checkbox.
		return {
			session: openSectionLinkPicker(settled, anchor.range, anchor.linkHeader.from, false),
			assignRequested: false
		};
	}
	return { session: settled, assignRequested: false };
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
	range: TextRange,
	/**
	 * Which side to take when no reported anchor describes this range — a card
	 * opened by a command rather than by a selection. It used to be `above`
	 * unconditionally, which put a keyboard-opened card off the top of the screen
	 * whenever the line it named was near the top of the viewport. The caller
	 * measures; the rule it applies is `selectionAnchorForView`'s own.
	 */
	fallback: 'above' | 'below' = 'above'
): 'above' | 'below' {
	return anchor && rangeKey(anchor.range) === rangeKey(range) ? anchor.prefer : fallback;
}
