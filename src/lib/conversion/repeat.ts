import type { TextRange } from '$lib/core/types.js';
import {
	CONVERSION_LIMITS,
	refuse,
	type ConversionDocument,
	type EngineResult,
	type Projection,
	type ReconciledDocument
} from './model.js';
import { contentOffset } from './projection.js';
import { reconcileEdit } from './reconcile.js';

export interface RepeatAction {
	kind: 'expandRepeat';
	/** Exact currently displayed repeated lyrics, including complete visible wrappers. */
	passage: TextRange;
	/** Separately confirmed trailing multiplier notation; never inferred from its spelling. */
	notation: TextRange;
	count: number;
	separator?: '\n' | ' ';
}

/** Expand only an explicitly confirmed scope/count. New occurrences are ordinary authored lyrics. */
export function expandRepeat(
	document: ConversionDocument,
	projection: Projection,
	action: RepeatAction
): EngineResult<ReconciledDocument> {
	const invalid = (message: string) => refuse<ReconciledDocument>('invalid-input', message);
	const validRange = (range: TextRange) =>
		range &&
		Number.isSafeInteger(range.from) &&
		Number.isSafeInteger(range.to) &&
		range.from >= 0 &&
		range.from < range.to &&
		range.to <= projection.text.length;
	if (
		!validRange(action.passage) ||
		!validRange(action.notation) ||
		action.passage.to > action.notation.from ||
		!/^[\t ]*$/u.test(projection.text.slice(action.passage.to, action.notation.from))
	)
		return invalid(
			'Select the repeated lyrics and their separate following notation, with only horizontal spacing between them.'
		);
	if (
		!Number.isSafeInteger(action.count) ||
		action.count < 2 ||
		action.count > 100 ||
		(action.separator !== undefined && action.separator !== '\n' && action.separator !== ' ')
	)
		return invalid(
			'Confirm a repeat count from two through one hundred and choose a line break or space separator.'
		);
	const passage = {
		from: contentOffset(projection, action.passage.from, -1),
		to: contentOffset(projection, action.passage.to, 1)
	};
	const notation = {
		from: contentOffset(projection, action.passage.to, -1),
		to: contentOffset(projection, action.notation.to, 1)
	};
	if (passage.from >= passage.to) return invalid('Select actual lyric text to repeat.');
	if (document.sections.some((section) => passage.from < section.at && section.at < notation.to))
		return invalid('A repeated passage and its notation must belong to one section.');
	const overlaps = (a: TextRange, b: TextRange) => a.from < b.to && b.from < a.to;
	const boundaries = [
		...document.wrappers,
		...document.forms,
		...document.decisions.filter((decision) => 'from' in decision)
	];
	if (
		boundaries.some(
			(detail) =>
				'from' in detail &&
				overlaps(detail, passage) &&
				!(passage.from <= detail.from && detail.to <= passage.to)
		)
	)
		return invalid(
			'Select the whole retained annotation, spelling or confirmed fact before repeating it.'
		);
	if (
		document.wrappers.some((wrapper) => overlaps(wrapper, notation)) ||
		document.forms.some((form) => overlaps(form, notation)) ||
		document.decisions.some((decision) => 'from' in decision && overlaps(decision, notation))
	)
		return invalid(
			'The multiplier notation contains retained details. Remove or reattach them explicitly before replacing it.'
		);
	const pieces: string[] = [];
	for (const segment of projection.segments) {
		if (overlaps(segment, action.notation) && segment.kind === 'generated')
			return invalid(
				'The multiplier notation must be literal text, without a section header or retained syntax.'
			);
		if (!overlaps(segment, action.passage)) continue;
		if (segment.kind === 'generated') {
			if (
				segment.part === 'header' ||
				segment.part === 'marker' ||
				segment.from < action.passage.from ||
				action.passage.to < segment.to
			)
				return invalid('The repeated selection crosses a section or clips retained syntax.');
			continue;
		}
		if (
			segment.kind === 'transformed' &&
			(segment.from < action.passage.from || action.passage.to < segment.to)
		)
			return invalid('Select the complete displayed spelling before repeating it.');
		pieces.push(
			projection.text.slice(
				Math.max(segment.from, action.passage.from),
				Math.min(segment.to, action.passage.to)
			)
		);
	}
	const lyrics = pieces.join('');
	if (
		!lyrics.trim() ||
		/\r|\n/u.test(projection.text.slice(action.notation.from, action.notation.to))
	)
		return invalid('Confirm nonempty repeated lyrics and a single-line multiplier notation.');
	const addition = ((action.separator ?? '\n') + lyrics).repeat(action.count - 1);
	if (
		projection.text.length - (action.notation.to - action.passage.to) + addition.length >
		CONVERSION_LIMITS.text
	)
		return refuse('operation-limit', 'The expanded repeats exceed the document size limit.');
	return reconcileEdit(document, projection, {
		changes: [{ from: action.passage.to, to: action.notation.to, insert: addition }],
		mirror: false
	});
}
