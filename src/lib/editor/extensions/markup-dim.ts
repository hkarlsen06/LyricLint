import { StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { ParsedDocument, SupportedStyleSpan } from '$lib/core/types.js';
import { setHeaderlessSectionsEffect } from './section-ghosts.js';

const dim = Decoration.mark({ class: 'll-syntax-dim' });

function pushRange(ranges: Range<Decoration>[], from: number, to: number): void {
	if (from < to) {
		ranges.push(dim.range(from, to));
	}
}

/**
 * Literal markup syntax — `<i>`/`</i>`-style tags and the header brackets —
 * renders dimmer than lyric text so the words stay the foreground.
 */
function buildDimRanges(state: EditorState, parsed: ParsedDocument): DecorationSet {
	if (parsed.text !== state.doc.toString()) {
		return Decoration.none;
	}
	const ranges: Range<Decoration>[] = [];

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
				const supported = span as SupportedStyleSpan;
				pushRange(ranges, supported.from, supported.contentFrom);
				pushRange(ranges, supported.contentTo, supported.to);
			}
		}
	}

	return Decoration.set(ranges, true);
}

export const markupDimField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, transaction) {
		if (transaction.docChanged) {
			value = Decoration.none;
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
 */
export const markupDimTheme = EditorView.baseTheme({
	'.ll-syntax-dim': {
		color: 'var(--color-text-muted)'
	}
});
