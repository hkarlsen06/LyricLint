import type { Diagnostic, Severity } from '$lib/core/types.js';
import { isHarperRuleId } from '$lib/rules/harper-ids.js';

/**
 * The identity a diagnostic is tracked by between re-lints. Rule and range
 * together: the same rule firing one character over is a different finding.
 */
export function diagnosticKey(diagnostic: Diagnostic): string {
	return `${diagnostic.ruleId}:${diagnostic.from}:${diagnostic.to}`;
}

const severityOrder: Record<Severity, number> = {
	error: 0,
	warning: 1,
	suggestion: 2,
	'manual-review': 3
};

/**
 * Harper's findings sort under every reviewed rule, whatever they say and
 * wherever they are in the document.
 *
 * **The reason is a layout shift, and the shift was the symptom of something
 * worse.** Harper is a WASM proofreader that answers ~250ms behind the rule
 * engine, so every edit publishes twice: the native findings at once, then the
 * union re-sorted when Harper lands. Interleaved by severity and position, a
 * Harper finding earlier in the document than the card the reader is on gets
 * *inserted above it* on that second publish — and after a fix that card is the
 * one `leadAfterFix` has just expanded, so the tall open card the pointer is
 * aimed at slides down by a row. Pressing fixes in a run, which is what this
 * panel is for, meant the button moving out from under the pointer on a delay.
 *
 * The deeper fault is that `leadAfterFix` chose that card from an incomplete
 * list: the lead is picked on the native-only publish, and the late arrival can
 * change which finding is actually first — leaving the wash on one finding and
 * the open card on another, which is the exact disagreement this module exists
 * to prevent. Provider rank fixes both at once, because a late Harper finding
 * can now only ever land *below* every native card, never above the lead.
 *
 * **It is a rank rather than a rule about arrival**, which is what makes it
 * safe: the order is still a pure function of the findings, so the same
 * document lists the same way whether Harper answered first, last, or twice.
 * Ordering by what arrived when would make the list depend on history and this
 * sort unrepeatable.
 *
 * It also says something true. The reviewed rules cite a Genius guideline and
 * carry an example somebody checked; Harper is a general-purpose English
 * proofreader that cites itself and knows nothing about lyrics — which is why
 * the merge already lets any native finding win a shared range, and why the
 * rule reference names Harper and gives it no pages. Reading order now says the
 * same thing.
 *
 * The editor's own sorts are deliberately untouched. `lint-decorations.ts`
 * orders the marks and badges *in the document*, where position is the only
 * order that means anything and a provider rank would shuffle the marks on one
 * line; this is the panel's reading order, and the panel is a list.
 */
const providerOrder = (diagnostic: Diagnostic): number =>
	isHarperRuleId(diagnostic.ruleId) ? 1 : 0;

/**
 * The order the linter reads in: reviewed rules before Harper's, then worst
 * first, then down the document. It lives here rather than in the list because
 * the panel has to know which diagnostic the list will lead with — after a fix
 * it hands the editor to exactly that one — and two sorts that only happened to
 * agree would drift apart.
 */
export function orderDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
	return [...diagnostics].sort(
		(left, right) =>
			providerOrder(left) - providerOrder(right) ||
			severityOrder[left.severity] - severityOrder[right.severity] ||
			left.from - right.from ||
			left.ruleId.localeCompare(right.ruleId)
	);
}
