// Decision record: docs/subsystems/drafts.md and docs/subsystems/section-links.md — read both before changing this file, and update them with any behavior change.
import type { CompareBaselineRecord, SectionLink } from '../core/types.js';

/**
 * A deep copy of a draft's section links.
 *
 * Shared rather than written out at each of the copiers, because this is the
 * exact shape of the bug `docs/subsystems/drafts.md` warns about: `copySnapshot` and
 * `copyDraft` each list the fields they keep by hand, and both of them spelled
 * out `{ lines: [...link.lines] }`. A link that gained a second field — which is
 * what happened the moment two choruses were allowed to differ — would have been
 * dropped on the way past by both of them, silently, while the editor, the
 * controller and the repository all looked correct.
 *
 * One function is not a guarantee either, but it is one place to change instead
 * of two to remember.
 */
export function copySectionLinks(links: readonly SectionLink[]): SectionLink[] {
	return links.map((link) => {
		const copy: SectionLink = { lines: [...link.lines] };
		if (link.holes) copy.holes = link.holes.map((hole) => ({ ...hole }));
		return copy;
	});
}

/**
 * A copy of the Compare dialog's baseline, shared by the same four copiers for
 * the same reason as the links above: a field spelled out by hand in each of
 * them is dropped in silence by whichever one a later change misses.
 */
export function copyCompareBaseline(baseline: CompareBaselineRecord): CompareBaselineRecord {
	return { text: baseline.text, pastedAt: baseline.pastedAt };
}
