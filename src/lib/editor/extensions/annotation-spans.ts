import type { Text } from '@codemirror/state';
import { scanAnnotations } from '$lib/core/annotations.js';
import type { AnnotationSpan } from '$lib/core/types.js';

const cache = new WeakMap<Text, readonly AnnotationSpan[]>();

/**
 * The document's annotation spans, scanned once per document version.
 *
 * Line classification inside the editor — the gutter deciding which lines get
 * a timestamp cell, sync mode deciding which lines a run visits — asks per
 * line on every update, and the annotation answer needs the whole text. The
 * cache keys on CodeMirror's immutable `Text` value, so a document version is
 * stringified and scanned exactly once however many lines ask.
 */
export function annotationSpansFor(doc: Text): readonly AnnotationSpan[] {
	let spans = cache.get(doc);
	if (!spans) {
		spans = scanAnnotations(doc.toString());
		cache.set(doc, spans);
	}
	return spans;
}
