import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { ParsedDocument, TextRange } from '../../core/types.js';
import { editorCallbacksField } from './editor-state.js';

export const setHeaderlessSectionsEffect = StateEffect.define<ParsedDocument>();

class SectionGhostWidget extends WidgetType {
	constructor(
		readonly range: TextRange,
		readonly activate: ((range: TextRange) => void) | undefined
	) {
		super();
	}

	eq(other: SectionGhostWidget): boolean {
		return other.range.from === this.range.from && other.range.to === this.range.to;
	}

	toDOM(): HTMLElement {
		const row = document.createElement('div');
		row.className = 'll-section-ghost';
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'll-section-ghost-button';
		button.textContent = '+ Add section header';
		button.addEventListener('mousedown', (event) => event.preventDefault());
		button.addEventListener('click', () => this.activate?.(this.range));
		row.append(button);
		return row;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function buildGhosts(state: EditorState, parsed: ParsedDocument): DecorationSet {
	if (parsed.text !== state.doc.toString()) {
		return Decoration.none;
	}

	const callbacks = state.field(editorCallbacksField);
	const ranges: Range<Decoration>[] = [];
	for (const section of parsed.sections) {
		const firstLine = section.lines[0];
		if (section.header || !firstLine) {
			continue;
		}
		const range = { from: firstLine.from, to: firstLine.to };
		ranges.push(
			Decoration.widget({
				block: true,
				side: -1,
				widget: new SectionGhostWidget(range, (selectedRange) =>
					callbacks?.onSectionHeaderRequest({ range: selectedRange, prefer: 'above' })
				)
			}).range(firstLine.from)
		);
	}
	return Decoration.set(ranges, true);
}

export const sectionGhostField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, transaction) {
		if (transaction.docChanged) {
			value = Decoration.none;
		}
		for (const effect of transaction.effects) {
			if (effect.is(setHeaderlessSectionsEffect)) {
				value = buildGhosts(transaction.state, effect.value);
			}
		}
		return value;
	},
	provide: (field) => EditorView.decorations.from(field)
});

export const sectionGhostTheme = EditorView.baseTheme({
	'.ll-section-ghost': {
		padding: '0.35rem 0 0.4rem'
	},
	'.ll-section-ghost-button': {
		padding: '0.26rem 0.75rem',
		border: '1px dashed color-mix(in oklch, currentColor 42%, transparent)',
		borderRadius: '999rem',
		background: 'color-mix(in oklch, currentColor 4%, transparent)',
		color: 'color-mix(in oklch, currentColor 70%, transparent)',
		font: '500 0.75rem/1.25 ui-sans-serif, system-ui, sans-serif',
		cursor: 'pointer'
	},
	'.ll-section-ghost-button:hover': {
		color: 'currentColor',
		borderColor: 'currentColor',
		background: 'color-mix(in oklch, currentColor 8%, transparent)'
	},
	'.ll-section-ghost-button:focus-visible': {
		outline: '2px solid var(--color-focus, var(--ll-focus, oklch(0.58 0.14 55)))',
		outlineOffset: '2px'
	}
});
