import { parseDocument } from '$lib/core/parser.js';
import type {
	Diagnostic,
	ParsedDocument,
	RuleContext,
	TextEdit,
	TextRange
} from '$lib/core/types.js';
import { sectionVerseNumberingRule } from '$lib/rules/catalog/section-verse-numbering.js';

function applyEdits(text: string, edits: readonly TextEdit[]): string {
	let output = text;
	for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
		output = `${output.slice(0, edit.from)}${edit.insert}${output.slice(edit.to)}`;
	}
	return output;
}

/** Translate an untouched source range through edits that all land outside it. */
function translatedRange(range: TextRange, edits: readonly TextEdit[]): TextRange | undefined {
	let delta = 0;
	for (const edit of [...edits].sort((left, right) => left.from - right.from)) {
		if (edit.to <= range.from) {
			delta += edit.insert.length - (edit.to - edit.from);
			continue;
		}
		if (edit.from >= range.to) break;
		return undefined;
	}
	return { from: range.from + delta, to: range.to + delta };
}

/**
 * Hide a verse-numbering answer whose premise is an unfixed prose header.
 *
 * `Verse 1:` is intentionally parsed as a lyric line until
 * `section.header-prose` brackets it. That can leave `[Verse 2]` looking like
 * the song's only verse, so the numbering rule provisionally asks to remove its
 * `2`. We keep that raw finding, apply the active header fixes to a throwaway
 * document, and draw the numbering finding only when it survives unchanged.
 *
 * This runs after occurrence ignores. Ignoring the prose-header finding removes
 * its fix from the throwaway document, which makes the provisional numbering
 * finding visible again without changing the lint engine's immutable result.
 */
export function filterProvisionalVerseNumbering(
	diagnostics: readonly Diagnostic[],
	document: ParsedDocument,
	context: RuleContext
): Diagnostic[] {
	const headerEdits = diagnostics
		.filter((diagnostic) => diagnostic.ruleId === 'section.header-prose')
		.flatMap(
			(diagnostic) =>
				diagnostic.fixes?.filter((fix) => fix.kind === 'safe').flatMap((fix) => fix.edit.edits) ??
				[]
		);
	if (headerEdits.length === 0) return [...diagnostics];

	const repairedText = applyEdits(document.text, headerEdits);
	if (repairedText === document.text) return [...diagnostics];
	const repairedFindings = sectionVerseNumberingRule.check(parseDocument(repairedText), context);

	return diagnostics.filter((diagnostic) => {
		if (diagnostic.ruleId !== sectionVerseNumberingRule.id) return true;
		const repairedRange = translatedRange(diagnostic, headerEdits);
		if (!repairedRange) return false;
		return repairedFindings.some(
			(candidate) =>
				candidate.from === repairedRange.from &&
				candidate.to === repairedRange.to &&
				candidate.message === diagnostic.message
		);
	});
}
