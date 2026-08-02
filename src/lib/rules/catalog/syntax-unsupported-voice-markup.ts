import type {
	Diagnostic,
	DiagnosticFix,
	LegendVoiceGroup,
	Offset,
	ParsedDocument,
	RuleContext,
	RuleDefinition,
	TextEdit,
	TextRange,
	UnsupportedStyleSpan
} from '$lib/core/types.js';
import { diagnostic } from './utils.js';

const REMOVE_MARKUP_LABEL = 'Remove markup';
const COMPLETE_TAG = /^<(\/?)([A-Za-z][\w-]*)(?:\s[^>]*)?>$/u;
const TAG_PREFIX = /^<\/?[A-Za-z][\w-]*/u;

function removalFix(context: RuleContext, edits: TextEdit[]): DiagnosticFix[] {
	return [
		{
			kind: 'preview',
			label: REMOVE_MARKUP_LABEL,
			edit: {
				baseRevision: context.revision ?? 0,
				edits
			}
		}
	];
}

/**
 * The exact range one unsupported fragment contributes to a removal.
 *
 * An unterminated fragment such as `<i sings` runs to the end of its line, so
 * only its tag-shaped prefix is removed and the lyric text after it survives.
 */
function removalRange(span: UnsupportedStyleSpan): TextRange | undefined {
	if (COMPLETE_TAG.test(span.rawTag)) {
		return { from: span.from, to: span.to };
	}
	const prefix = TAG_PREFIX.exec(span.rawTag);
	return prefix ? { from: span.from, to: span.from + prefix[0].length } : undefined;
}

function tagName(span: UnsupportedStyleSpan): { closing: boolean; name: string } | undefined {
	const match = COMPLETE_TAG.exec(span.rawTag);
	return match
		? { closing: match[1] === '/', name: (match[2] ?? '').toLocaleLowerCase('en') }
		: undefined;
}

/** Index pairs of unsupported opening and closing tags that wrap each other. */
function matchTagPairs(spans: readonly UnsupportedStyleSpan[]): Map<number, number> {
	const partners = new Map<number, number>();
	const openTags: number[] = [];

	spans.forEach((span, index) => {
		const tag = tagName(span);
		if (!tag) {
			return;
		}
		if (!tag.closing) {
			openTags.push(index);
			return;
		}
		for (let cursor = openTags.length - 1; cursor >= 0; cursor -= 1) {
			const candidate = openTags[cursor];
			if (candidate === undefined) {
				continue;
			}
			const openSpan = spans[candidate];
			if (!openSpan || tagName(openSpan)?.name !== tag.name) {
				continue;
			}
			partners.set(candidate, index);
			partners.set(index, candidate);
			// Opening tags nested inside this pair stay unmatched.
			openTags.length = cursor;
			break;
		}
	});

	return partners;
}

/**
 * Removal edits for every unsupported inline fragment, keyed by its offset.
 *
 * A wrapper's opening and closing tags are removed together so one confirmation
 * leaves the lyric line clean. Pairing never crosses a section boundary.
 */
function inlineRemovals(document: ParsedDocument): Map<Offset, TextEdit[]> {
	const removals = new Map<Offset, TextEdit[]>();

	for (const section of document.sections) {
		const spans = section.lines.flatMap((line) =>
			line.styleSpans.filter((span): span is UnsupportedStyleSpan => 'unsupported' in span)
		);
		const partners = matchTagPairs(spans);

		spans.forEach((span, index) => {
			const own = removalRange(span);
			if (!own) {
				return;
			}
			const partnerIndex = partners.get(index);
			const partnerSpan = partnerIndex === undefined ? undefined : spans[partnerIndex];
			const partner = partnerSpan ? removalRange(partnerSpan) : undefined;
			const ranges = partner ? [own, partner].sort((left, right) => left.from - right.from) : [own];
			removals.set(
				span.from,
				ranges.map((range) => ({ ...range, insert: '' }))
			);
		});
	}

	return removals;
}

/** Removal edits stripping every tag from one legend group's exact raw text. */
function legendRemovals(group: LegendVoiceGroup): TextEdit[] {
	const edits = Array.from(group.raw.matchAll(/<\/?[A-Za-z][^>]*>/gu), (match) => ({
		from: group.from + match.index,
		to: group.from + match.index + match[0].length,
		insert: ''
	}));
	let remaining = '';
	let cursor = 0;
	for (const edit of edits) {
		remaining += group.raw.slice(cursor, edit.from - group.from);
		cursor = edit.to - group.from;
	}
	remaining += group.raw.slice(cursor);
	// Stripping the tags has to leave a performer name behind, not an empty slot.
	return remaining.trim().length > 0 ? edits : [];
}

export const syntaxUnsupportedVoiceMarkupRule: RuleDefinition = {
	id: 'syntax.unsupported-voice-markup',
	version: 2,
	defaultSeverity: 'error',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		const removals = inlineRemovals(document);
		const diagnostics: Diagnostic[] = document.syntaxIssues
			.filter((issue) => issue.code === 'unsupported-markup' || issue.code === 'malformed-markup')
			.map((issue) => {
				const edits = removals.get(issue.from);
				return diagnostic(
					this,
					issue,
					'Unsupported performer markup.',
					'Performer differentiation supports plain, italic, bold, and nested bold-italic slots. This literal tag or malformed nesting is preserved for review.',
					edits ? removalFix(context, edits) : undefined
				);
			});

		for (const section of document.sections) {
			for (const group of section.header?.legendGroups ?? []) {
				if (!group.markupSupported) {
					const edits = legendRemovals(group);
					diagnostics.push(
						diagnostic(
							this,
							group,
							'Unsupported performer markup in the section legend.',
							'The section legend uses markup outside the four supported differentiation slots. It is preserved and requires a previewed correction.',
							edits.length > 0 ? removalFix(context, edits) : undefined
						)
					);
				}
			}
		}
		return diagnostics;
	}
};
