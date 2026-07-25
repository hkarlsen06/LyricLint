import { parseDocument } from '$lib/core/parser.js';
import type {
	Diagnostic,
	PerformerRecord,
	RuleContext,
	RuleDefinition,
	TextEdit
} from '$lib/core/types.js';
import { sourceRegistry } from './data/sources.js';

/**
 * Revision every helper-built context reports. It is deliberately neither zero
 * nor one so a fix that loses its `baseRevision` fails instead of looking
 * plausible against a fresh snapshot.
 */
export const testRevision = 41;

export interface RuleTestOptions {
	language?: string;
	performers?: readonly string[];
	revision?: number;
}

export function performerRecords(names: readonly string[]): PerformerRecord[] {
	return names.map((displayName, order) => ({
		id: `performer-${order}`,
		displayName,
		normalizedKey: displayName.toLocaleLowerCase(),
		aliases: [],
		colorId: `color-${order}`,
		order
	}));
}

export function ruleContext(options: RuleTestOptions = {}): RuleContext {
	return {
		language: options.language ?? 'en',
		performers: performerRecords(options.performers ?? []),
		sources: sourceRegistry,
		ruleSetVersion: 'rule-test',
		revision: options.revision ?? testRevision
	};
}

export function checkRule(
	rule: RuleDefinition,
	text: string,
	options: RuleTestOptions = {}
): Diagnostic[] {
	return rule.check(parseDocument(text), ruleContext(options));
}

/**
 * The exact source text each diagnostic covers. Asserting on slices pins the
 * UTF-16 offsets without restating them, so astral characters and combining
 * marks cannot drift unnoticed.
 */
export function markedText(text: string, diagnostics: readonly Diagnostic[]): string[] {
	return diagnostics.map((finding) => text.slice(finding.from, finding.to));
}

/** The insert of every fix a rule offered, in diagnostic order. */
export function fixInserts(diagnostics: readonly Diagnostic[]): string[] {
	return diagnostics.flatMap(
		(finding) => finding.fixes?.map((fix) => fix.edit.edits[0]?.insert ?? '') ?? []
	);
}

export function applyEdits(text: string, edits: readonly TextEdit[]): string {
	let output = text;
	for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
		output = `${output.slice(0, edit.from)}${edit.insert}${output.slice(edit.to)}`;
	}
	return output;
}

/** Apply every fix one rule offers for a document as a single batch. */
export function applyRuleFixes(
	rule: RuleDefinition,
	text: string,
	options: RuleTestOptions = {}
): string {
	const edits = checkRule(rule, text, options).flatMap(
		(finding) => finding.fixes?.flatMap((fix) => fix.edit.edits) ?? []
	);
	return applyEdits(text, edits);
}
