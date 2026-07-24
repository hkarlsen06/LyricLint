import type { ParsedDocument, TextRange } from '../core/types.js';

export type ExportValidationCode =
	'unsupported-markup' | 'malformed-markup' | 'unbalanced-section-bracket' | 'document-mismatch';

export interface ExportValidationIssue extends TextRange {
	code: ExportValidationCode;
	message: string;
	raw: string;
}

export interface ExportValidationResult {
	valid: boolean;
	issues: ExportValidationIssue[];
	/** The exact input is returned for callers that need to prove non-mutation. */
	text: string;
}

/**
 * Validate the canonical source without sanitizing, normalizing, or serializing
 * it. The parser remains the authority for recoverable malformed markup.
 */
export function validateExport(text: string, parsed: ParsedDocument): ExportValidationResult {
	const issues: ExportValidationIssue[] = parsed.syntaxIssues.map((issue) => ({
		from: issue.from,
		to: issue.to,
		code: issue.code,
		message: issue.message,
		raw: issue.raw
	}));

	for (const section of parsed.sections) {
		for (const group of section.header?.legendGroups ?? []) {
			if (!group.markupSupported) {
				issues.push({
					from: group.from,
					to: group.to,
					code: 'unsupported-markup',
					message: 'This performer legend contains unsupported or malformed markup.',
					raw: group.raw
				});
			}
		}
	}

	if (text !== parsed.text) {
		issues.push({
			from: 0,
			to: text.length,
			code: 'document-mismatch',
			message: 'Export text does not match the parsed canonical document.',
			raw: text
		});
	}

	const deduplicated = new Map<string, ExportValidationIssue>();
	for (const issue of issues) {
		deduplicated.set(`${issue.code}:${issue.from}:${issue.to}:${issue.raw}`, issue);
	}
	const result = [...deduplicated.values()].sort(
		(left, right) => left.from - right.from || left.to - right.to
	);
	return { valid: result.length === 0, issues: result, text };
}

/** Copy/export always returns the canonical string, even when validation warns. */
export function prepareCanonicalCopy(text: string, parsed: ParsedDocument): string {
	void parsed;
	return text;
}
