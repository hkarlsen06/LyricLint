import { StateEffect, StateField, Transaction } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { TextRange } from '$lib/core/types.js';
import { setConversionStateEffect } from './conversion-effects.js';
import { conversionForState } from './conversion-state.js';
import { editorCallbacksField } from './editor-state.js';

const setConversionScopeEffect = StateEffect.define<string | undefined>();
export const conversionScopeField = StateField.define<string | undefined>({
	create: () => undefined,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setConversionScopeEffect)) value = effect.value;
			if (
				effect.is(setConversionStateEffect) &&
				(!effect.value ||
					effect.value.envelope.profile !== 'musixmatch' ||
					!effect.value.envelope.model.links.some((link) => link.sectionIds.includes(value ?? '')))
			)
				value = undefined;
		}
		return value;
	}
});
export function conversionSectionLocal(state: EditorState): string | undefined {
	return state.field(conversionScopeField, false);
}
/** A real selected passage must fit one retained section, including coincident boundaries. */
export function conversionSectionAt(state: EditorState, range: TextRange): string | undefined {
	const conversion = conversionForState(state);
	if (
		!conversion ||
		conversion.recovery ||
		conversion.envelope.profile !== 'musixmatch' ||
		!Number.isSafeInteger(range.from) ||
		!Number.isSafeInteger(range.to) ||
		range.from < 0 ||
		range.from > range.to ||
		range.to > state.doc.length
	)
		return undefined;
	const sections = conversion.projection.sections;
	const index = sections.findLastIndex((section) => section.at <= range.from);
	if (index < 0 || range.to > (sections[index + 1]?.at ?? state.doc.length)) return undefined;
	return sections[index]!.id;
}
export function cancelConversionSectionLocal(view: EditorView): boolean {
	if (!conversionSectionLocal(view.state)) return false;
	view.dispatch({
		effects: setConversionScopeEffect.of(undefined),
		annotations: Transaction.addToHistory.of(false)
	});
	view.state.field(editorCallbacksField, false)?.onSectionLinksChanged?.();
	return true;
}
export function toggleConversionSectionLocal(view: EditorView, sectionId: string): boolean {
	const conversion = conversionForState(view.state);
	if (
		!conversion ||
		conversion.recovery ||
		conversion.envelope.profile !== 'musixmatch' ||
		!conversion.envelope.model.links.some((link) => link.sectionIds.includes(sectionId))
	)
		return false;
	const value = conversionSectionLocal(view.state) === sectionId ? undefined : sectionId;
	view.dispatch({
		effects: setConversionScopeEffect.of(value),
		annotations: Transaction.addToHistory.of(false)
	});
	view.state.field(editorCallbacksField, false)?.onSectionLinksChanged?.();
	return true;
}
