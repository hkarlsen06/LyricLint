import type { Diagnostic, DiagnosticFix } from '#lib/core/types.js';
import { diagnosticKey } from './order.js';

/**
 * One row in Review: every place where the reader would answer the same
 * question the same way. `members` is never empty and runs in document order.
 */
export interface Decision {
	key: string;
	members: readonly Diagnostic[];
}

/**
 * What makes two findings one decision, or `null` when a finding always gets a
 * row of its own.
 *
 * The row shows one message, so the message is in the key: it has to be true of
 * every member. That is why this is not `fixBatchKey`, which would put the
 * opening and the closing curly quote under one message that is false for half
 * of them. Severity is in it so a decision never straddles a severity chip.
 * A finding that spans other ranges or names a detected language describes
 * something larger than its own place, so it never folds into another.
 */
export function decisionKey(diagnostic: Diagnostic): string | null {
	if (diagnostic.relatedRanges?.length || diagnostic.detectedLanguage) return null;
	return [
		'decision',
		diagnostic.ruleId,
		diagnostic.severity,
		diagnostic.message,
		diagnostic.identityText ?? '',
		...(diagnostic.fixes ?? []).map((fix) => fix.label)
	].join('\0');
}

/**
 * Fold the panel's ordered findings into decisions, in the order of each
 * decision's first member, so the list still reads in `orderDiagnostics` order.
 * A finding with no decision key is keyed by `soloKey`.
 */
export function groupDecisions(
	ordered: readonly Diagnostic[],
	soloKey: (diagnostic: Diagnostic) => string = diagnosticKey
): Decision[] {
	const decisions = new Map<string, Diagnostic[]>();
	for (const diagnostic of ordered) {
		const key = decisionKey(diagnostic) ?? soloKey(diagnostic);
		const members = decisions.get(key);
		if (members) members.push(diagnostic);
		else decisions.set(key, [diagnostic]);
	}
	return Array.from(decisions, ([key, members]) => ({
		key,
		members: members.length > 1 ? members.sort((a, b) => a.from - b.from) : members
	}));
}

/** How many rows Review draws for these findings. Order does not matter. */
export function countDecisions(diagnostics: readonly Diagnostic[]): number {
	return groupDecisions(diagnostics).length;
}

/**
 * The rows still standing after `settled` (a bulk plan's fixes) is applied. A
 * finding counts as settled by the same test `planBulkFix` uses for its
 * automatic count, so the strip's two numbers describe one press.
 */
export function countDecisionsLeft(
	diagnostics: readonly Diagnostic[],
	settled: readonly DiagnosticFix[]
): number {
	const fixes = new Set(settled);
	return countDecisions(
		diagnostics.filter((diagnostic) => !(diagnostic.fixes ?? []).some((fix) => fixes.has(fix)))
	);
}
