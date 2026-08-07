import { describe, expect, it } from 'vitest';
import type { Diagnostic, TextRange } from '$lib/core/types.js';
import type { ScreenRect, SelectionAnchor } from './contracts.js';
import {
	activateDiagnostic,
	anchorPlacement,
	applyPerformerPicker,
	askSectionVoice,
	beginLegendAssignment,
	cachedAnchorRect,
	cancelPerformerPicker,
	closeOverlay,
	closedOverlaySession,
	dismissDiagnostic,
	finishPerformerAssignment,
	forgetDismissedSelection,
	openPerformerPicker,
	openSectionPicker,
	overlayRange,
	rangeKey,
	releaseUnanchoredDiagnostic,
	reportSelectionAnchor,
	type LegendAssignment,
	type OverlaySession
} from './overlay-state.js';

const selection: TextRange = { from: 4, to: 9 };
const otherRange: TextRange = { from: 20, to: 24 };

function diagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
	return {
		ruleId: 'performer.inline-mismatch',
		severity: 'warning',
		from: 12,
		to: 18,
		message: 'Inline style has no performer in the section legend.',
		explanation: 'The styled passage has no voice in the header.',
		sourceIds: [],
		...overrides
	};
}

function legend(overrides: Partial<LegendAssignment> = {}): LegendAssignment {
	return {
		sectionFrom: 0,
		styleSlot: 2,
		step: 'section',
		sectionPerformerIds: ['avery'],
		styledPerformerIds: [],
		...overrides
	};
}

function rect(top: number): ScreenRect {
	return { left: 10, top, right: 90, bottom: top + 16, width: 80, height: 16 };
}

function anchor(overrides: Partial<SelectionAnchor> = {}): SelectionAnchor {
	return {
		range: selection,
		rect: rect(100),
		prefer: 'below',
		offersAssignment: true,
		...overrides
	};
}

/** Every way an overlay can be opened, for the mutual-exclusion sweep. */
const openings: ReadonlyArray<{ name: string; open: (session: OverlaySession) => OverlaySession }> =
	[
		{ name: 'performer picker', open: (session) => openPerformerPicker(session, selection, true) },
		{
			name: 'legend assignment',
			open: (session) => beginLegendAssignment(session, selection, legend())
		},
		{ name: 'section picker', open: (session) => openSectionPicker(session, otherRange) },
		{
			name: 'diagnostic popover',
			open: (session) => activateDiagnostic(session, diagnostic(), true)
		}
	];

describe('overlay state', () => {
	it('starts closed with nothing suppressed', () => {
		expect(closedOverlaySession()).toEqual({ overlay: { kind: 'none' } });
	});

	it('reports the anchor range of every variant', () => {
		expect(overlayRange({ kind: 'none' })).toBeUndefined();
		expect(overlayRange({ kind: 'performer', range: selection, takesFocus: true })).toEqual(
			selection
		);
		expect(overlayRange({ kind: 'section', range: otherRange })).toEqual(otherRange);
		expect(
			overlayRange({ kind: 'diagnostic', diagnostic: diagnostic(), takesFocus: false })
		).toEqual({ from: 12, to: 18 });
		expect(
			overlayRange({
				kind: 'diagnostic',
				diagnostic: diagnostic({ from: 15, to: 15, relatedRanges: [{ from: 14, to: 15 }] }),
				takesFocus: false
			})
		).toEqual({ from: 14, to: 15 });
	});

	it('anchors a shared diagnostic to the particular related occurrence that opened it', () => {
		const issue = diagnostic({ relatedRanges: [{ from: 40, to: 48 }] });
		const related = { from: 40, to: 48 };
		const opened = activateDiagnostic(closedOverlaySession(), issue, false, related);

		expect(overlayRange(opened.overlay)).toEqual(related);
		expect(activateDiagnostic(opened, issue, false, related)).toBe(opened);
		expect(
			overlayRange(
				activateDiagnostic(opened, issue, false, { from: issue.from, to: issue.to }).overlay
			)
		).toEqual({ from: issue.from, to: issue.to });
	});
});

describe('overlay mutual exclusion', () => {
	// The union replaced four independent booleans plus a legend record. These
	// are the combinations that were previously representable — two overlays at
	// once, or a legend step surviving into an overlay that cannot show it.
	for (const from of openings) {
		for (const to of openings) {
			it(`leaves only the ${to.name} open when it follows the ${from.name}`, () => {
				const session = to.open(from.open(closedOverlaySession()));
				const opened = to.open(closedOverlaySession());

				expect(session.overlay).toEqual(opened.overlay);
			});
		}
	}

	it('drops a pending legend step when any other overlay takes over', () => {
		const pending = beginLegendAssignment(closedOverlaySession(), selection, legend());
		expect(pending.overlay).toMatchObject({ kind: 'performer', legend: { step: 'section' } });

		expect(openPerformerPicker(pending, selection, true).overlay).toEqual({
			kind: 'performer',
			range: selection,
			takesFocus: true
		});
		expect(openSectionPicker(pending, otherRange).overlay).toEqual({
			kind: 'section',
			range: otherRange
		});
		expect(activateDiagnostic(pending, diagnostic(), false).overlay).toEqual({
			kind: 'diagnostic',
			diagnostic: diagnostic(),
			takesFocus: false
		});
	});

	it('keeps the keyboard-opened and pointer-opened popover distinguishable', () => {
		expect(activateDiagnostic(closedOverlaySession(), diagnostic(), true).overlay).toMatchObject({
			takesFocus: true
		});
		expect(activateDiagnostic(closedOverlaySession(), diagnostic(), false).overlay).toMatchObject({
			takesFocus: false
		});
	});

	it('returns the same session when the diagnostic already on screen is re-reported', () => {
		// Hovering an underline reports it on every pointer move.
		const issue = diagnostic();
		const open = activateDiagnostic(closedOverlaySession(), issue, false);

		expect(activateDiagnostic(open, issue, false)).toBe(open);
		expect(activateDiagnostic(open, issue, true)).not.toBe(open);
		expect(activateDiagnostic(open, diagnostic(), false)).not.toBe(open);
	});
});

describe('diagnostic dismissal', () => {
	it('reports the Escape as unhandled when no popover is open', () => {
		for (const session of [
			closedOverlaySession(),
			openPerformerPicker(closedOverlaySession(), selection, true),
			openSectionPicker(closedOverlaySession(), otherRange)
		]) {
			const result = dismissDiagnostic(session);

			expect(result).toEqual({ session, dismissed: false });
		}
	});

	it('closes the popover and reports the Escape as handled', () => {
		const open = activateDiagnostic(closedOverlaySession(), diagnostic(), true);

		expect(dismissDiagnostic(open)).toEqual({
			session: { overlay: { kind: 'none' } },
			dismissed: true
		});
	});

	it('returns focus only when the popover held it', () => {
		expect(
			releaseUnanchoredDiagnostic(activateDiagnostic(closedOverlaySession(), diagnostic(), true))
		).toEqual({ session: { overlay: { kind: 'none' } }, returnFocus: true });
		expect(
			releaseUnanchoredDiagnostic(activateDiagnostic(closedOverlaySession(), diagnostic(), false))
		).toEqual({ session: { overlay: { kind: 'none' } }, returnFocus: false });
	});

	it('leaves a picker alone when the scroll check finds no popover', () => {
		const picker = openPerformerPicker(closedOverlaySession(), selection, true);

		expect(releaseUnanchoredDiagnostic(picker)).toEqual({ session: picker, returnFocus: false });
	});
});

describe('dismissed selections', () => {
	it('suppresses the selection the user cancelled out of', () => {
		const cancelled = cancelPerformerPicker(
			openPerformerPicker(closedOverlaySession(), selection, true)
		);

		expect(cancelled).toEqual({
			overlay: { kind: 'none' },
			dismissedSelection: rangeKey(selection)
		});
	});

	it('does not reopen the picker for a selection already dismissed', () => {
		const cancelled = cancelPerformerPicker(
			openPerformerPicker(closedOverlaySession(), selection, true)
		);

		const report = reportSelectionAnchor(cancelled, anchor());

		expect(report).toEqual({ session: cancelled, assignRequested: false });
	});

	it('still opens the picker for a different selection', () => {
		const cancelled = cancelPerformerPicker(
			openPerformerPicker(closedOverlaySession(), selection, true)
		);

		const report = reportSelectionAnchor(cancelled, anchor({ range: otherRange }));

		expect(report).toEqual({
			session: {
				overlay: { kind: 'performer', range: otherRange, takesFocus: false },
				dismissedSelection: '4:9'
			},
			assignRequested: true
		});
	});

	it('retires the dismissal once the document revision moves the offsets', () => {
		const cancelled = cancelPerformerPicker(
			openPerformerPicker(closedOverlaySession(), selection, true)
		);

		const reopened = reportSelectionAnchor(forgetDismissedSelection(cancelled), anchor());

		expect(reopened).toEqual({
			session: { overlay: { kind: 'performer', range: selection, takesFocus: false } },
			assignRequested: true
		});
	});

	// The one path nobody pressed. A double-clicked word is most often a word
	// about to be typed over, so the card that draws itself beside it may not
	// take the caret out of the document — the aimed presses may, because
	// neither has a pointer behind it to drive the roster with.
	it('opens the uninvited card without the focus, and the aimed ones with it', () => {
		expect(reportSelectionAnchor(closedOverlaySession(), anchor()).session.overlay).toMatchObject({
			kind: 'performer',
			takesFocus: false
		});
		expect(openPerformerPicker(closedOverlaySession(), selection, true).overlay).toMatchObject({
			takesFocus: true
		});
		expect(
			beginLegendAssignment(closedOverlaySession(), selection, legend()).overlay
		).toMatchObject({ takesFocus: true });
	});

	it('leaves an untouched session identical so a revision bump cannot churn state', () => {
		const open = openPerformerPicker(closedOverlaySession(), selection, true);

		expect(forgetDismissedSelection(open)).toBe(open);
	});

	it('records the dismissal for a legend picker cancelled on the diagnostic range', () => {
		const pending = beginLegendAssignment(closedOverlaySession(), selection, legend());

		expect(cancelPerformerPicker(pending).dismissedSelection).toBe(rangeKey(selection));
	});

	it('closes without a dismissal when nothing selection-driven was open', () => {
		const section = openSectionPicker(closedOverlaySession(), otherRange);

		expect(cancelPerformerPicker(section)).toEqual({ overlay: { kind: 'none' } });
	});
});

describe('selection anchor reports', () => {
	it('ignores a selection that does not offer an assignment', () => {
		const session = closedOverlaySession();

		expect(reportSelectionAnchor(session, anchor({ offersAssignment: false }))).toEqual({
			session,
			assignRequested: false
		});
	});

	// The picker is open on the range the user is answering; a selection made
	// somewhere unassignable while it stands says nothing about that answer.
	it('leaves an open picker standing when a later selection offers nothing', () => {
		const open = openPerformerPicker(closedOverlaySession(), selection, true);

		expect(
			reportSelectionAnchor(open, anchor({ range: otherRange, offersAssignment: false }))
		).toEqual({
			session: open,
			assignRequested: false
		});
	});

	it('does not re-request assignment for the picker already on that range', () => {
		const open = openPerformerPicker(closedOverlaySession(), selection, true);

		expect(reportSelectionAnchor(open, anchor())).toEqual({
			session: open,
			assignRequested: false
		});
	});

	it('replaces a legend picker when the user selects a different range', () => {
		const pending = beginLegendAssignment(closedOverlaySession(), selection, legend());

		expect(reportSelectionAnchor(pending, anchor({ range: otherRange }))).toEqual({
			session: { overlay: { kind: 'performer', range: otherRange, takesFocus: false } },
			assignRequested: true
		});
	});

	it('retires the performer picker when the selection stops being anchorable', () => {
		const open = openPerformerPicker(closedOverlaySession(), selection, true);

		expect(reportSelectionAnchor(open, undefined)).toEqual({
			session: { overlay: { kind: 'none' } },
			assignRequested: false
		});
	});

	it('leaves overlays the selection did not open in place', () => {
		// A collapsed caret is not a reason to close a section picker or a
		// diagnostic popover: neither was opened from the selection.
		const section = openSectionPicker(closedOverlaySession(), otherRange);
		const popover = activateDiagnostic(closedOverlaySession(), diagnostic(), true);

		expect(reportSelectionAnchor(section, undefined).session).toBe(section);
		expect(reportSelectionAnchor(popover, undefined).session).toBe(popover);
	});
});

describe('performer assignment', () => {
	it('has nothing to apply when no picker is open', () => {
		expect(applyPerformerPicker(closedOverlaySession(), ['avery'])).toEqual({ kind: 'none' });
		expect(
			applyPerformerPicker(openSectionPicker(closedOverlaySession(), otherRange), ['avery'])
		).toEqual({ kind: 'none' });
	});

	it('commits an ordinary selection over the picker range', () => {
		const open = openPerformerPicker(closedOverlaySession(), selection, true);

		const outcome = applyPerformerPicker(open, ['avery', 'blair']);

		expect(outcome).toEqual({
			kind: 'range',
			range: selection,
			performerIds: ['avery', 'blair']
		});
	});

	// Step two answers a different question than step one, so what it hands back
	// is the section's voice — the selection's own was chosen a step earlier and
	// has to survive the second press.
	it('carries the selection voice through the section-voice step', () => {
		const open = askSectionVoice(openPerformerPicker(closedOverlaySession(), selection, true), [
			'avery'
		]);

		expect(applyPerformerPicker(open, ['blair'])).toEqual({
			kind: 'range',
			range: selection,
			performerIds: ['avery'],
			sectionPerformerIds: ['blair']
		});
	});

	// "Skip" is a real answer: it commits step one exactly as pressing
	// Apply would have before the question existed.
	it('commits the selection alone when no section voice is named', () => {
		const open = askSectionVoice(openPerformerPicker(closedOverlaySession(), selection, true), [
			'avery'
		]);

		expect(applyPerformerPicker(open, [])).toEqual({
			kind: 'range',
			range: selection,
			performerIds: ['avery']
		});
	});

	it('suppresses the selection an applied assignment consumed', () => {
		const open = openPerformerPicker(closedOverlaySession(), selection, true);
		const outcome = applyPerformerPicker(open, ['avery']);
		if (outcome.kind !== 'range') {
			throw new Error('An open picker over a selection must commit a range assignment.');
		}

		expect(finishPerformerAssignment(open, outcome)).toEqual({
			overlay: { kind: 'none' },
			dismissedSelection: rangeKey(selection)
		});
	});

	it('advances the legend flow without closing the picker', () => {
		const pending = beginLegendAssignment(closedOverlaySession(), selection, legend());

		const outcome = applyPerformerPicker(pending, ['avery', 'blair']);
		if (outcome.kind !== 'advance') {
			throw new Error('Step one of the legend flow must advance rather than commit.');
		}

		expect(outcome.session.overlay).toEqual({
			kind: 'performer',
			range: selection,
			takesFocus: true,
			legend: {
				sectionFrom: 0,
				styleSlot: 2,
				step: 'styled',
				sectionPerformerIds: ['avery', 'blair'],
				styledPerformerIds: []
			}
		});
	});

	it('commits both legend groups in slot order on the second step', () => {
		const pending = beginLegendAssignment(
			closedOverlaySession(),
			selection,
			legend({ step: 'styled', sectionPerformerIds: ['avery'] })
		);

		expect(applyPerformerPicker(pending, ['blair'])).toEqual({
			kind: 'legend',
			sectionFrom: 0,
			assignments: [
				{ styleSlot: 1, performerIds: ['avery'] },
				{ styleSlot: 2, performerIds: ['blair'] }
			],
			unwrapSlots: []
		});
	});

	it('commits a styled-only section as its plain voice and unwraps the markup', () => {
		// One voice needs no differentiation: writing it into slot 2 would leave
		// the legend starting at italic with no plain group before it.
		const pending = beginLegendAssignment(
			closedOverlaySession(),
			selection,
			legend({ step: 'styled', promoteToPlain: true })
		);

		expect(applyPerformerPicker(pending, ['blair'])).toEqual({
			kind: 'legend',
			sectionFrom: 0,
			assignments: [{ styleSlot: 1, performerIds: ['blair'] }],
			unwrapSlots: [2]
		});
	});

	it('leaves the selection eligible after a legend assignment', () => {
		// The legend flow starts from a diagnostic, not from a selection the user
		// made, so it must not suppress the picker for that range afterwards.
		const pending = beginLegendAssignment(
			closedOverlaySession(),
			selection,
			legend({ step: 'styled' })
		);
		const outcome = applyPerformerPicker(pending, ['blair']);
		if (outcome.kind !== 'legend') {
			throw new Error('Step two of the legend flow must commit both groups.');
		}

		const settled = finishPerformerAssignment(pending, outcome);

		expect(settled).toEqual({ overlay: { kind: 'none' } });
		expect(reportSelectionAnchor(settled, anchor()).assignRequested).toBe(true);
	});

	it('copies the applied ids so the picker cannot mutate the recorded step', () => {
		const performerIds = ['avery'];
		const pending = beginLegendAssignment(closedOverlaySession(), selection, legend());
		const outcome = applyPerformerPicker(pending, performerIds);
		if (outcome.kind !== 'advance') {
			throw new Error('Step one of the legend flow must advance rather than commit.');
		}
		performerIds.push('blair');

		expect(outcome.session.overlay).toMatchObject({
			legend: { sectionPerformerIds: ['avery'] }
		});
	});
});

describe('anchor caching', () => {
	it('reuses the reported rect only at the scroll position it was measured at', () => {
		const reported = anchor();

		expect(cachedAnchorRect(reported, selection, 3, 3)).toBe(reported.rect);
		expect(cachedAnchorRect(reported, selection, 4, 3)).toBeUndefined();
	});

	it('does not reuse a rect measured for a different range', () => {
		expect(cachedAnchorRect(anchor(), otherRange, 0, 0)).toBeUndefined();
	});

	it('has nothing to reuse without a reported anchor', () => {
		expect(cachedAnchorRect(undefined, selection, 0, 0)).toBeUndefined();
	});

	it('keeps the reported placement across scrolling', () => {
		// Only the rect goes stale on scroll; flipping the card from below to
		// above mid-scroll would move it out from under the pointer.
		expect(anchorPlacement(anchor(), selection)).toBe('below');
		expect(anchorPlacement(anchor({ prefer: 'above' }), selection)).toBe('above');
	});

	it('falls back to above for a range no anchor was reported for', () => {
		expect(anchorPlacement(anchor(), otherRange)).toBe('above');
		expect(anchorPlacement(undefined, selection)).toBe('above');
	});
});

describe('closing', () => {
	it('closes every overlay without disturbing the dismissal', () => {
		// IME composition suppresses overlays; the preedit is not a reason to
		// forget that the user already dismissed a picker.
		const suppressed = closeOverlay({
			overlay: { kind: 'diagnostic', diagnostic: diagnostic(), takesFocus: true },
			dismissedSelection: rangeKey(selection)
		});

		expect(suppressed).toEqual({
			overlay: { kind: 'none' },
			dismissedSelection: rangeKey(selection)
		});
	});
});
