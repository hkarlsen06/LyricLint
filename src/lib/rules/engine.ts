import type { Diagnostic, ParsedDocument, RuleContext, RuleDefinition } from '$lib/core/types.js';
import { enabledRules } from './registry.js';
import { sortDiagnostics } from './results.js';
export { sortDiagnostics, collectSafeFixes } from './results.js';

/** Run a registry synchronously against one immutable parsed document. */
export function runRules(
	document: ParsedDocument,
	context: RuleContext,
	registry: readonly RuleDefinition[] = enabledRules
): Diagnostic[] {
	const diagnostics = registry.flatMap((rule) => rule.check(document, context));
	return sortDiagnostics(diagnostics);
}
