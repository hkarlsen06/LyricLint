import type { Diagnostic, Severity } from '$lib/core/types.js';

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
 * The order the linter reads in: worst first, then down the document. It lives
 * here rather than in the list because the panel has to know which diagnostic
 * the list will lead with — after a fix it hands the editor to exactly that one
 * — and two sorts that only happened to agree would drift apart.
 */
export function orderDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
	return [...diagnostics].sort(
		(left, right) =>
			severityOrder[left.severity] - severityOrder[right.severity] ||
			left.from - right.from ||
			left.ruleId.localeCompare(right.ruleId)
	);
}
