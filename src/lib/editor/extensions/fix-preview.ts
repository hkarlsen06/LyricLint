import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { AtomicDocumentEdit, TextEdit } from '$lib/core/types.js';
import { isCompositionChange } from './editor-state.js';

export const setFixPreviewEffect = StateEffect.define<AtomicDocumentEdit | undefined>();

export class FixPreviewWidget extends WidgetType {
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
		preview.setAttribute('aria-label', `Suggested addition: ${this.text}`);
		return preview;
	}

	/**
	 * A widget swallows every plugin handler by default — CodeMirror stops at the
	 * first `ignoreEvent` on the way up from the target — so the pointer resting
	 * on the replacement text reached the diagnostic hover watcher not at all.
	 * Only pointing is let through: the diff is not text, so a press on it must
	 * still not place a caret inside a change that has not been applied.
	 */
	ignoreEvent(event: Event): boolean {
		return event.type !== 'mousemove';
	}
}

class BlankLineRemovalWidget extends WidgetType {
	eq(): boolean {
		return true;
	}

	toDOM(): HTMLElement {
		const preview = document.createElement('span');
		preview.className = 'll-fix-preview-remove ll-fix-preview-blank-line';
		preview.textContent = '↵';
		preview.setAttribute('aria-label', 'Suggested removal: blank line');
		preview.title = 'Blank line';
		return preview;
	}

	ignoreEvent(event: Event): boolean {
		return event.type !== 'mousemove';
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

		// Every change reads as a diff: the text the fix would drop stays put,
		// struck through, and the replacement sits beside it. Nothing is hidden,
		// so the preview alone explains what Apply will do.
		if (change.from < change.to) {
			const removed = state.doc.sliceString(change.from, change.to);
			ranges.push(
				removed.trim().length === 0 && /[\r\n]/u.test(removed)
					? Decoration.widget({
							widget: new BlankLineRemovalWidget(),
							side: 1
						}).range(change.from)
					: Decoration.mark({
							class: 'll-fix-preview-remove',
							attributes: { 'aria-label': `Suggested removal: ${removed}` }
						}).range(change.from, change.to)
			);
		}

		if (change.insert.length > 0) {
			ranges.push(
				Decoration.widget({
					widget: new FixPreviewWidget(change.insert),
					side: 1
				}).range(change.to)
			);
		}
	}

	return Decoration.set(ranges, true);
}

export const fixPreviewField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, transaction) {
		if (transaction.docChanged) {
			value = isCompositionChange(transaction) ? value.map(transaction.changes) : Decoration.none;
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
		marginInline: '0.1em',
		paddingInline: '0.15em',
		borderRadius: 'var(--radius-xs)',
		background: 'color-mix(in oklch, var(--color-suggestion) 24%, transparent)',
		boxShadow: 'inset 0 -2px 0 var(--color-suggestion)',
		color: 'var(--color-text)',
		whiteSpace: 'pre-wrap'
	},
	'.ll-fix-preview-remove': {
		borderRadius: 'var(--radius-xs)',
		background: 'color-mix(in oklch, var(--color-danger) 16%, transparent)',
		color: 'var(--color-text-muted)',
		textDecoration: 'line-through',
		textDecorationColor: 'var(--color-danger)',
		textDecorationThickness: '2px'
	},
	'.ll-fix-preview-blank-line': {
		display: 'inline-block',
		paddingInline: '0.15em',
		color: 'var(--color-text-muted)',
		textDecoration: 'none',
		boxShadow: 'inset 0 -2px 0 var(--color-danger)'
	}
});
