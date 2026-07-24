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

function unexpectedMarkupIssues(text: string, parsed: ParsedDocument): ExportValidationIssue[] {
	const allowedRanges: TextRange[] = parsed.sections.flatMap((section) => [
		...section.lines.flatMap((line) =>
			line.styleSpans
				.filter((span) => !('unsupported' in span))
				.map((span) => ({ from: span.from, to: span.to }))
		),
		...(section.header?.legendGroups ?? [])
			.filter((group) => group.markupSupported && group.styleSlot !== 1)
			.map((group) => ({ from: group.from, to: group.to }))
	]);
	const issues: ExportValidationIssue[] = [];

	for (const match of text.matchAll(/<\/?[A-Za-z][^>]*>/gu)) {
		const from = match.index;
		const to = from + match[0].length;
		if (allowedRanges.some((range) => range.from <= from && to <= range.to)) {
			continue;
		}
		issues.push({
			from,
			to,
			code: 'unsupported-markup',
			message: 'This tag-like markup is not valid in the canonical document at this location.',
			raw: match[0]
		});
	}

	for (const section of parsed.sections) {
		const header = section.header;
		if (!header) {
			continue;
		}
		const nameFrom = header.nameRange.from;
		const rawName = header.rawNamePart;
		for (const match of rawName.matchAll(/<\/?[A-Za-z][^>]*?(?:>|$)/gu)) {
			const from = nameFrom + match.index;
			issues.push({
				from,
				to: from + match[0].length,
				code: 'unsupported-markup',
				message: 'Section-header names cannot contain tag-like markup.',
				raw: match[0]
			});
		}
	}

	return issues;
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
	issues.push(...unexpectedMarkupIssues(text, parsed));

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
