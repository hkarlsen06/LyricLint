import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { AtomicDocumentEdit, TextEdit } from '../../core/types.js';

export const setFixPreviewEffect = StateEffect.define<AtomicDocumentEdit | undefined>();

class FixPreviewWidget extends WidgetType {
	constructor(readonly text: string) {
		super();
	}

	eq(other: FixPreviewWidget): boolean {
		return other.text === this.text;
	}

	toDOM(): HTMLElement {
		const preview = document.createElement('span');
		preview.className = 'll-fix-preview-insert';
		preview.textContent = this.text;
		preview.setAttribute('aria-label', `Preview replacement: ${this.text}`);
		return preview;
	}
}

function validEdit(edit: TextEdit, documentLength: number): boolean {
	return (
		Number.isSafeInteger(edit.from) &&
		Number.isSafeInteger(edit.to) &&
		edit.from >= 0 &&
		edit.from <= edit.to &&
		edit.to <= documentLength
	);
}

function buildPreview(state: EditorState, edit: AtomicDocumentEdit | undefined): DecorationSet {
	if (!edit) {
		return Decoration.none;
	}

	const ranges: Range<Decoration>[] = [];
	const sorted = [...edit.edits].sort(
		(left, right) => left.from - right.from || left.to - right.to
	);
	let previousTo = -1;

	for (const change of sorted) {
		if (!validEdit(change, state.doc.length) || change.from < previousTo) {
			return Decoration.none;
		}
		previousTo = change.to;

		if (change.insert.length === 0 && change.from < change.to) {
			ranges.push(
				Decoration.mark({
					class: 'll-fix-preview-remove',
					attributes: { 'aria-label': 'Preview deletion' }
				}).range(change.from, change.to)
			);
			continue;
		}

		const decoration = Decoration.replace({
			widget: new FixPreviewWidget(change.insert),
			inclusive: false
		});
		ranges.push(decoration.range(change.from, change.to));
	}

	return Decoration.set(ranges, true);
}

export const fixPreviewField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, transaction) {
		if (transaction.docChanged) {
			value = Decoration.none;
		}
		for (const effect of transaction.effects) {
			if (effect.is(setFixPreviewEffect)) {
				value = buildPreview(transaction.state, effect.value);
			}
		}
		return value;
	},
	provide: (field) => EditorView.decorations.from(field)
});

export const fixPreviewTheme = EditorView.baseTheme({
	'.ll-fix-preview-insert': {
		display: 'inline',
		paddingInline: '0.15em',
		borderRadius: 'var(--radius-xs, 0.25rem)',
		background:
			'color-mix(in oklch, var(--color-suggestion, oklch(0.43 0.09 210)) 24%, transparent)',
		boxShadow: 'inset 0 -2px 0 var(--color-suggestion, oklch(0.43 0.09 210))',
		color: 'var(--color-text, currentColor)',
		whiteSpace: 'pre-wrap'
	},
	'.ll-fix-preview-remove': {
		borderRadius: 'var(--radius-xs, 0.25rem)',
		background: 'color-mix(in oklch, var(--color-danger, oklch(0.47 0.16 28)) 16%, transparent)',
		color: 'var(--color-text-muted, currentColor)',
		textDecoration: 'line-through',
		textDecorationColor: 'var(--color-danger, currentColor)',
		textDecorationThickness: '2px'
	}
});
