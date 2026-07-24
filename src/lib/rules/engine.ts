import type {
	Diagnostic,
	DiagnosticFix,
	ParsedDocument,
	RuleContext,
	RuleDefinition,
	Severity
} from '../core/types.js';
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

/** Flatten only fixes explicitly classified as safe for bulk application. */
export function collectSafeFixes(diagnostics: readonly Diagnostic[]): DiagnosticFix[] {
	return sortDiagnostics(diagnostics).flatMap(
		(diagnostic) => diagnostic.fixes?.filter((fix) => fix.kind === 'safe') ?? []
	);
}

/** Pure ignore filter; session-storage ownership remains outside the rule layer. */
export function filterIgnored(
	diagnostics: readonly Diagnostic[],
	isIgnored: (diagnostic: Diagnostic) => boolean
): Diagnostic[] {
	return diagnostics.filter((diagnostic) => !isIgnored(diagnostic));
}
