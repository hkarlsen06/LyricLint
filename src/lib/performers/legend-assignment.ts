import type { Diagnostic, ParsedDocument, StyleSlot } from '$lib/core/types.js';
import { usedStyleSlots } from './legend-cleanup.js';

/** The section and slot a `performer.inline-mismatch` assignment would write. */
export interface LegendAssignmentTarget {
	sectionFrom: number;
	styleSlot: StyleSlot;
	/**
	 * The section is styled all the way through, so its one voice belongs in the
	 * plain slot and the wrappers come off with the assignment.
	 */
	promoteToPlain?: boolean;
}

/**
 * Why a diagnostic offers no legend assignment.
 *
 * `not-applicable` — a different rule, or a span this flow cannot name.
 * `no-header` — the section has no header to hold a legend at all.
 * `needs-plain-lyrics` — two styled slots and no plain text: promoting one
 * still leaves the other ahead of a slot nothing fills.
 */
export type LegendAssignmentBlockReason = 'not-applicable' | 'no-header' | 'needs-plain-lyrics';

export type LegendAssignmentResolution =
	| { status: 'available'; target: LegendAssignmentTarget }
	| { status: 'unavailable'; reason: LegendAssignmentBlockReason };

const UNAVAILABLE = (reason: LegendAssignmentBlockReason): LegendAssignmentResolution => ({
	status: 'unavailable',
	reason
});

/**
 * Whether a diagnostic's styled passage can be given a performer legend, and
 * what that assignment would target.
 *
 * Both surfaces that offer the action — the editor's diagnostic popover and the
 * linter panel's card — resolve it here, so neither shows a control the other
 * hides or the document cannot honour.
 */
export function resolveLegendAssignment(
	document: ParsedDocument,
	diagnostic: Diagnostic
): LegendAssignmentResolution {
	if (diagnostic.ruleId !== 'performer.inline-mismatch') {
		return UNAVAILABLE('not-applicable');
	}
	const section = document.sections.find((candidate) =>
		candidate.lines.some((line) =>
			line.styleSpans.some(
				(span) =>
					!('unsupported' in span) && span.from <= diagnostic.from && diagnostic.to <= span.to
			)
		)
	);
	if (!section) {
		return UNAVAILABLE('not-applicable');
	}
	if (!section.header) {
		return UNAVAILABLE('no-header');
	}
	const span = section.lines
		.flatMap((line) => line.styleSpans)
		.find(
			(candidate) =>
				!('unsupported' in candidate) &&
				candidate.from <= diagnostic.from &&
				diagnostic.to <= candidate.to
		);
	if (!span || 'unsupported' in span || span.slot === 1) {
		return UNAVAILABLE('not-applicable');
	}

	// Plain lyrics in the section mean two voices to tell apart, so both get
	// named and the markup stays. A section styled all the way through has only
	// one voice: it becomes the plain one and the wrappers come off.
	const used = usedStyleSlots(section);
	if (used.has(1)) {
		return { status: 'available', target: { sectionFrom: section.from, styleSlot: span.slot } };
	}
	return used.size === 1
		? {
				status: 'available',
				target: { sectionFrom: section.from, styleSlot: span.slot, promoteToPlain: true }
			}
		: UNAVAILABLE('needs-plain-lyrics');
}
