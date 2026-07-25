import type { Diagnostic, ParsedDocument, RuleDefinition, Section } from '$lib/core/types.js';
import { diagnostic } from './utils.js';

function hasCleanBody(section: Section): boolean {
	return (
		section.lines.length > 0 &&
		section.lines.every((line) => !line.styleSpans.some((span) => 'unsupported' in span))
	);
}

function bodiesMatch(first: Section, second: Section): boolean {
	return (
		first.lines.length === second.lines.length &&
		first.lines.every((line, index) => line.text === second.lines[index]?.text)
	);
}

function headersAllowJoin(first: Section, second: Section): boolean {
	if (!first.header) {
		return false;
	}
	if (!second.header) {
		return true;
	}
	return first.header.raw === second.header.raw;
}

export function isImmediateRepeat(document: ParsedDocument, sectionIndex: number): boolean {
	const section = document.sections[sectionIndex];
	const previous = document.sections[sectionIndex - 1];
	return Boolean(
		section &&
		previous &&
		hasCleanBody(previous) &&
		hasCleanBody(section) &&
		headersAllowJoin(previous, section) &&
		bodiesMatch(previous, section)
	);
}

/**
 * Whether a parser-created headerless section is actually an exact immediate
 * repeat of the headed part before it. The missing-header rule uses the same
 * predicate so the two diagnostics cannot contradict each other.
 */
export function isImmediateHeaderlessRepeat(
	document: ParsedDocument,
	sectionIndex: number
): boolean {
	const section = document.sections[sectionIndex];
	return Boolean(section && !section.header && isImmediateRepeat(document, sectionIndex));
}

export const sectionImmediateRepeatSpacingRule: RuleDefinition = {
	id: 'section.immediate-repeat-spacing',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'safe',
	sourceIds: ['G-SECTIONS', 'G-REPEATS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (let index = 1; index < document.sections.length; index += 1) {
			const previous = document.sections[index - 1];
			const section = document.sections[index];
			if (!previous || !section || !isImmediateRepeat(document, index)) {
				continue;
			}
			const previousLastLine = previous.lines.at(-1);
			const currentFirstLine = section.lines[0];
			if (!previousLastLine || !currentFirstLine) {
				continue;
			}
			const separator = document.text.slice(
				previousLastLine.lineEndingRange.from,
				previousLastLine.lineEndingRange.to
			);
			if (!separator) {
				continue;
			}
			const replacementRange = {
				from: previousLastLine.to,
				to: currentFirstLine.from
			};
			diagnostics.push(
				diagnostic(
					this,
					section.header ? { from: section.header.from, to: section.header.to } : replacementRange,
					'Keep an immediately repeated song part under one header.',
					'This section exactly repeats the song part immediately before it. Genius keeps the repeated lyrics, but places both copies together under the same header without a blank separator.',
					[
						{
							kind: 'safe',
							label: 'Join exact repeated part',
							edit: {
								baseRevision: context.revision ?? 0,
								edits: [{ ...replacementRange, insert: separator }]
							}
						}
					]
				)
			);
		}
		return diagnostics;
	}
};
