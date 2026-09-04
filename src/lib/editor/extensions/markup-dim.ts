import { StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { ParsedDocument } from '$lib/core/types.js';
import { isCompositionChange } from './editor-state.js';
import { setHeaderlessSectionsEffect } from './section-ghosts.js';

const dim = Decoration.mark({ class: 'll-syntax-dim' });

function pushRange(ranges: Range<Decoration>[], from: number, to: number): void {
	if (from < to) {
		ranges.push(dim.range(from, to));
	}
}

/**
 * Literal markup syntax — `<i>`/`</i>`-style tags, the header brackets, and
 * the delimiters of annotation links — renders dimmer than lyric text so the
 * words stay the foreground. An annotation dims only its wrapper: the opening
 * `[` and the closing `](id)`. The fragment between them is sung lyrics and
 * keeps the lyric face, because the markup is Genius's anchor around the words
 * rather than a substitute for them — and the whole span stays plain editable
 * text, never hidden, so a bracket can be nudged or an annotation copied to a
 * repeated line without any mode to leave first.
 */
function buildDimRanges(state: EditorState, parsed: ParsedDocument): DecorationSet {
	if (parsed.text !== state.doc.toString()) {
		return Decoration.none;
	}
	const ranges: Range<Decoration>[] = [];

	for (const annotation of parsed.annotations) {
		pushRange(ranges, annotation.from, annotation.fragmentRange.from);
		pushRange(ranges, annotation.fragmentRange.to, annotation.to);
	}

	for (const section of parsed.sections) {
		const header = section.header;
		if (header) {
			pushRange(ranges, header.from, header.from + 1);
			if (header.closed) {
				pushRange(ranges, header.to - 1, header.to);
			}
			for (const group of header.legendGroups) {
				if (!group.markupSupported || group.styleSlot === 1) {
					continue;
				}
				pushRange(ranges, group.from, group.nameRange.from);
				pushRange(ranges, group.nameRange.to, group.to);
			}
		}
		for (const line of section.lines) {
			for (const span of line.styleSpans) {
				if ('unsupported' in span) {
					continue;
				}
				pushRange(ranges, span.from, span.contentFrom);
				pushRange(ranges, span.contentTo, span.to);
			}
		}
	}

	return Decoration.set(ranges, true);
}

export const markupDimField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, transaction) {
		if (transaction.docChanged) {
			value = isCompositionChange(transaction) ? value.map(transaction.changes) : Decoration.none;
		}
		for (const effect of transaction.effects) {
			if (effect.is(setHeaderlessSectionsEffect)) {
				value = buildDimRanges(transaction.state, effect.value.parsed);
			}
		}
		return value;
	},
	provide: (field) => EditorView.decorations.from(field)
});

/*
 * Recede the markup with the muted text color rather than `opacity: 0.55`.
 * These are the brackets and asterisks of the lyric source, which the design
 * rules require to stay visible and exactly readable; an opacity took them to
 * roughly 2:1 against the editor surface, and it also dimmed any performer tint
 * or fix-preview background sharing the same run of characters.
 *
 * The mono face is stated here too, and this decoration is why the lyric/markup
 * font split works at all: the document's base face is `--font-lyrics` (prose,
 * for the words), and the spans this field marks are exactly the spans that are
 * source rather than song — so the one decoration carries both halves of what
 * "this is markup" means, the tone and the type, and neither can be lost
 * without the other.
 */
export const markupDimTheme = EditorView.baseTheme({
	'.ll-syntax-dim': {
		color: 'var(--color-text-muted)',
		fontFamily: 'var(--font-mono)'
	}
});
