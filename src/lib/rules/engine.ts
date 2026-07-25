import type {
	Diagnostic,
	DiagnosticFix,
	ParsedDocument,
	RuleContext,
	RuleDefinition,
	Severity,
	TextEdit
} from '$lib/core/types.js';
import { enabledRules } from './registry.js';

const severityOrder: Record<Severity, number> = {
	error: 0,
	warning: 1,
	suggestion: 2,
	'manual-review': 3
};

/** Sort diagnostics deterministically by severity, range, rule, and copy. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
	return [...diagnostics].sort(
		(left, right) =>
			severityOrder[left.severity] - severityOrder[right.severity] ||
			left.from - right.from ||
			left.to - right.to ||
			left.ruleId.localeCompare(right.ruleId) ||
			left.message.localeCompare(right.message) ||
			left.explanation.localeCompare(right.explanation)
	);
}

/** Run a registry synchronously against one immutable parsed document. */
export function runRules(
	document: ParsedDocument,
	context: RuleContext,
	registry: readonly RuleDefinition[] = enabledRules
): Diagnostic[] {
	const diagnostics = registry.flatMap((rule) => rule.check(document, context));
	return sortDiagnostics(diagnostics);
}

/**
 * Two edits collide when their ranges overlap, or when both are insertions at
 * the same offset — the latter produce order-dependent output, so neither can
 * claim the point.
 */
function editsCollide(left: TextEdit, right: TextEdit): boolean {
	if (left.from === left.to && right.from === right.to) {
		return left.from === right.from;
	}
	return left.from < right.to && right.from < left.to;
}

/**
 * Flatten only fixes explicitly classified as safe for bulk application,
 * keeping the batch internally consistent.
 *
 * Different rules can legitimately target overlapping text: a repeat-spacing
 * join deletes a header that a localization rule wants to rename. Applying
 * both corrupts the document, so the first fix to claim a range wins and later
 * collisions are dropped. Ordering comes from `sortDiagnostics`, which makes
 * the winner deterministic and severity-ranked rather than registry-ordered.
 *
 * Dropping is not discarding: a dropped fix is still on its diagnostic for
 * individual application, and re-running the engine after the batch offers it
 * again against the new revision. Arbitration cannot be resolved by applying
 * in passes instead, because every fix in one batch shares a `baseRevision`
 * and the apply path rejects stale ones — a batch is atomic by contract.
 */
export function collectSafeFixes(diagnostics: readonly Diagnostic[]): DiagnosticFix[] {
	const accepted: DiagnosticFix[] = [];
	const claimed: TextEdit[] = [];
	for (const diagnostic of sortDiagnostics(diagnostics)) {
		for (const fix of diagnostic.fixes ?? []) {
			if (fix.kind !== 'safe') continue;
			// All or nothing: half of a multi-edit fix would leave the document in
			// a state no rule intended.
			const collides = fix.edit.edits.some((edit) =>
				claimed.some((taken) => editsCollide(edit, taken))
			);
			if (collides) continue;
			accepted.push(fix);
			claimed.push(...fix.edit.edits);
		}
	}
	return accepted;
}

/** Pure ignore filter; session-storage ownership remains outside the rule layer. */
export function filterIgnored(
	diagnostics: readonly Diagnostic[],
	isIgnored: (diagnostic: Diagnostic) => boolean
): Diagnostic[] {
	return diagnostics.filter((diagnostic) => !isIgnored(diagnostic));
}
