import { Annotation, StateEffect } from '@codemirror/state';
import type { ConversionEnvelope } from '$lib/persistence/conversion.js';
import type { Projection } from '$lib/conversion/model.js';

export interface ConversionState {
	envelope: ConversionEnvelope;
	projection: Projection;
	recovery?: import('$lib/persistence/conversion.js').ConversionRecovery;
}

/** Projection replacements bypass lyric-edit inference and linked mirroring. */
export const profileProjection = Annotation.define<boolean>();
export const setConversionStateEffect = StateEffect.define<ConversionState | undefined>();
