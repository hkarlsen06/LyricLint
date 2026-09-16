import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';
import type { PerformerRecord } from '$lib/core/types.js';
import type { ConversionEnvelope } from '$lib/persistence/conversion.js';
import type { ClipboardMediaSource } from '../clipboard-metadata.js';
import { profileProjection } from './conversion-effects.js';

export interface PendingClipboardReview {
	from: number;
	to: number;
	text: string;
	conversion: ConversionEnvelope;
	performers: PerformerRecord[];
	media?: ClipboardMediaSource;
}

export const setClipboardReviewEffect = StateEffect.define<PendingClipboardReview | undefined>();
export const clipboardReviewField = StateField.define<PendingClipboardReview | undefined>({
	create: () => undefined,
	update(value, transaction) {
		if (value && transaction.annotation(profileProjection)) value = undefined;
		if (value && transaction.docChanged) {
			let touched = false;
			const previous = value;
			transaction.changes.iterChangedRanges((from, to) => {
				if (from <= previous.to && previous.from <= to) touched = true;
			});
			value = touched
				? undefined
				: {
						...value,
						from: transaction.changes.mapPos(value.from, 1),
						to: transaction.changes.mapPos(value.to, -1)
					};
		}
		for (const effect of transaction.effects)
			if (effect.is(setClipboardReviewEffect)) value = effect.value;
		if (value && transaction.newDoc.sliceString(value.from, value.to) !== value.text)
			return undefined;
		return value;
	}
});

export const clipboardReviewHistory = invertedEffects.of((transaction) =>
	transaction.effects.some((effect) => effect.is(setClipboardReviewEffect))
		? [setClipboardReviewEffect.of(transaction.startState.field(clipboardReviewField, false))]
		: []
);

export function clipboardReviewFor(state: EditorState): PendingClipboardReview | undefined {
	return state.field(clipboardReviewField, false);
}
