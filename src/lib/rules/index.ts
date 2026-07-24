import type { Diagnostic, ParsedDocument, RuleContext, RuleDefinition } from '../core/types.js';

function rulesWorker(): never {
	throw new Error('not implemented: rules worker');
}

/** Return the reviewed rule definitions enabled in the bundled rule set. */
export function getEnabledRules(): RuleDefinition[] {
	return rulesWorker();
}

/** Run the enabled registry synchronously against one parsed document revision. */
export function runRules(_document: ParsedDocument, _context: RuleContext): Diagnostic[] {
	void _document;
	void _context;
	return rulesWorker();
}
