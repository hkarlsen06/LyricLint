import type { Diagnostic } from '#lib/core/types.js';
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

/**
 * Arrange this snapshot's ranked rows in the order they were drawn before.
 * Rows that survive keep their order relative to each other, whatever answered
 * a place in them; a new row enters after the nearest row ranked above it that
 * is already drawn, or first when there is none.
 */
export function keepOrder(ranked: readonly Decision[], drawn: readonly string[]): Decision[] {
	const current = new Map(ranked.map((decision) => [decision.key, decision]));
	const arranged = drawn.flatMap((key) => current.get(key) ?? []);
	const placed = new Set(arranged);
	for (const [index, decision] of ranked.entries()) {
		if (placed.has(decision)) continue;
		const above = ranked.slice(0, index).findLast((candidate) => placed.has(candidate));
		arranged.splice(above ? arranged.indexOf(above) + 1 : 0, 0, decision);
		placed.add(decision);
	}
	return arranged;
}

/** How many rows Review draws for these findings. Order does not matter. */
export function countDecisions(diagnostics: readonly Diagnostic[]): number {
	return groupDecisions(diagnostics).length;
}
