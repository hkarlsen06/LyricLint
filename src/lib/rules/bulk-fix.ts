import type { AtomicDocumentEdit, Diagnostic, DiagnosticFix } from '$lib/core/types.js';
import { collectSafeFixes } from './results.js';

/**
 * What makes two fixes the same change.
 *
 * A card previews exactly one fix as a diff in the document, and that diff is
 * the user's whole evidence for pressing anything beside it. So a batch reached
 * from a card may only contain edits the preview honestly stands in for: same
 * rule, same label. Batching by rule alone would sweep up `til` → `'til` from a
 * card showing `Imma` → `I'ma` — both `spelling.standardized`, neither one the
 * change on screen.
 *
 * The label is the right key rather than a lucky one: fix labels are written to
 * name the change ("Replace with I'ma", "Remove markup"), so two fixes share a
 * label exactly when they read as the same command.
 */
export function fixBatchKey(diagnostic: Diagnostic, fix: DiagnosticFix): string {
	return `${diagnostic.ruleId}\0${fix.label}`;
}

function safeFixesMatching(diagnostic: Diagnostic, key: string): DiagnosticFix[] {
	return (diagnostic.fixes ?? []).filter(
		(candidate) => candidate.kind === 'safe' && fixBatchKey(diagnostic, candidate) === key
	);
}

/**
 * Every safe fix in `diagnostics` that is the same change as `fix`, including
 * `fix` itself.
 *
 * Arbitration goes through `collectSafeFixes` rather than being repeated here,
 * so a batch reached from a card drops colliding edits by exactly the rule a
 * whole-document batch does.
 */
export function collectMatchingFixes(
	diagnostics: readonly Diagnostic[],
	diagnostic: Diagnostic,
	fix: DiagnosticFix
): DiagnosticFix[] {
	if (fix.kind !== 'safe') return [];
	const key = fixBatchKey(diagnostic, fix);
	const matching = diagnostics
		.filter((candidate) => candidate.ruleId === diagnostic.ruleId)
		.map((candidate) => ({ ...candidate, fixes: safeFixesMatching(candidate, key) }))
		.filter((candidate) => candidate.fixes.length > 0);
	return collectSafeFixes(matching);
}

/** What a whole-document bulk fix would do, and what it would leave behind. */
export interface BulkFixPlan {
	/** The safe fixes to dispatch, already arbitrated against each other. */
	fixes: readonly DiagnosticFix[];
	/** Diagnostics the batch resolves — the number the button offers to fix. */
	automatic: number;
	/** Diagnostics it does not touch, which the user has to decide about. */
	manual: number;
}

/**
 * Split the diagnostics the panel is showing into what a bulk fix settles and
 * what it leaves.
 *
 * Both numbers count diagnostics rather than fixes, because they are read as
 * one sentence about the panel's own list: `22 automatically` and `18 need a
 * decision` have to add up to what the user can see.
 */
export function planBulkFix(diagnostics: readonly Diagnostic[]): BulkFixPlan {
	const accepted = new Set(collectSafeFixes(diagnostics));
	const automatic = diagnostics.filter((diagnostic) =>
		(diagnostic.fixes ?? []).some((fix) => accepted.has(fix))
	).length;
	return {
		fixes: [...accepted],
		automatic,
		manual: diagnostics.length - automatic
	};
}

/**
 * Fold a batch into the single atomic edit the apply path requires.
 *
 * A batch cannot be dispatched fix by fix: every fix in it carries the same
 * `baseRevision`, so the first dispatch would make every later one stale, and
 * the user would get one undo step per fix for what they pressed once.
 *
 * `selectionAfter` is deliberately dropped. A single fix can say where the
 * caret belongs afterwards; a batch spread down the document cannot, and the
 * panel is about to select the leading remaining diagnostic anyway.
 */
export function mergeFixes(fixes: readonly DiagnosticFix[]): AtomicDocumentEdit | undefined {
	const [first] = fixes;
	if (!first) return undefined;
	const baseRevision = first.edit.baseRevision;
	if (fixes.some((fix) => fix.edit.baseRevision !== baseRevision)) return undefined;
	const edits = fixes
		.flatMap((fix) => fix.edit.edits)
		.sort((left, right) => left.from - right.from || left.to - right.to);
	return { baseRevision, edits };
}
