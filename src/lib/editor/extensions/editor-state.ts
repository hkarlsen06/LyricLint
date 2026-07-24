import { StateEffect, StateField } from '@codemirror/state';
import type { EditorCallbacks } from '../../core/types.js';
import type { EditorDisplayContext } from '../contracts.js';

export const setEditorContextEffect = StateEffect.define<EditorDisplayContext>();
export const setEditorCallbacksEffect = StateEffect.define<EditorCallbacks>();
export const setComposingEffect = StateEffect.define<boolean>();

export const editorContextField = StateField.define<EditorDisplayContext | undefined>({
	create: () => undefined,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setEditorContextEffect)) {
				value = effect.value;
			}
		}
		return value;
	}
});

export const editorRevisionField = StateField.define<number>({
	create: () => 0,
	update(value, transaction) {
		return transaction.docChanged ? value + 1 : value;
	}
});

export const editorComposingField = StateField.define<boolean>({
	create: () => false,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setComposingEffect)) {
				value = effect.value;
			}
		}
		return value;
	}
});

export const editorCallbacksField = StateField.define<EditorCallbacks | undefined>({
	create: () => undefined,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setEditorCallbacksEffect)) {
				value = effect.value;
			}
		}
		return value;
	}
});
