import type { TextRange } from '$lib/core/types.js';
import { scanPhysicalLines } from '$lib/core/parser.js';
import {
	decideInstrumentalRepresentation,
	decideQuantityRepresentation,
	parseQuantityInteger,
	type InstrumentalIntervalFacts,
	type QuantityFacts
} from '$lib/profiles/decisions.js';
import {
	allocateId,
	refuse,
	type ConversionDocument,
	type EngineResult,
	type Projection,
	type ReconciledDocument
} from './model.js';
import { contentOffset, renderProfile } from './projection.js';
import { resolveDecision } from './decisions.js';
import { reconcileEdit } from './reconcile.js';

export type FactAction =
	| { kind: 'confirmQuantity'; range: TextRange; facts: QuantityFacts }
	| {
			kind: 'confirmInstrumentalInterval';
			facts: InstrumentalIntervalFacts;
			markerRange?: TextRange;
	  }
	| { kind: 'setRecording'; recordingId?: string };

/** Supplied facts enter through the same sourced eligibility owner as every review surface. */
export function resolveFactDecision(
	document: ConversionDocument,
	projection: Projection,
	action: FactAction
): EngineResult<ReconciledDocument> {
	const next: ConversionDocument = {
		...document,
		decisions: [...document.decisions],
		markers: [...document.markers]
	};
	if (action.kind === 'setRecording') {
		if (
			action.recordingId !== undefined &&
			(typeof action.recordingId !== 'string' || action.recordingId.length > 2000)
		)
			return refuse('invalid-input', 'The recording reference is invalid.');
		next.recordingId = action.recordingId;
	} else if (action.kind === 'confirmQuantity') {
		if (
			!action.range ||
			!Number.isSafeInteger(action.range.from) ||
			!Number.isSafeInteger(action.range.to) ||
			action.range.from < 0 ||
			action.range.from >= action.range.to ||
			action.range.to > projection.text.length ||
			!action.facts ||
			typeof action.facts !== 'object' ||
			typeof action.facts.value !== 'string' ||
			(action.facts.spokenForm !== undefined && typeof action.facts.spokenForm !== 'string') ||
			(action.facts.digitForm !== undefined && typeof action.facts.digitForm !== 'string')
		)
			return refuse(
				'invalid-input',
				'Select the complete quantity and provide its confirmed reading.'
			);
		const range = {
			from: contentOffset(projection, action.range.from, -1),
			to: contentOffset(projection, action.range.to, 1)
		};
		const language =
			next.languageRanges.find((entry) => entry.from <= range.from && range.to <= entry.to)
				?.language ?? next.defaultLanguage;
		if (
			next.languageRanges.some(
				(entry) =>
					(range.from < entry.from && entry.from < range.to) ||
					(range.from < entry.to && entry.to < range.to)
			)
		)
			return refuse('invalid-input', 'A quantity cannot cross differently assigned languages.');
		const facts = { ...action.facts, language };
		const checked = decideQuantityRepresentation(facts);
		if (!checked.ok)
			return refuse(
				checked.reason === 'invalid-fact' ? 'invalid-input' : 'unavailable-capability',
				checked.message
			);
		const selected = projection.text.slice(action.range.from, action.range.to);
		if (
			/\p{Nd}/u.test(selected) &&
			(/\p{Nd}/u.test(projection.text[action.range.from - 1] ?? '') ||
				/\p{Nd}/u.test(projection.text[action.range.to] ?? ''))
		)
			return refuse('invalid-input', 'Select every digit of the quantity.');
		if (!/\p{Nd}/u.test(selected) && facts.spokenForm === undefined && selected !== checked.value)
			return refuse(
				'invalid-input',
				'Confirm the exact selected words as the spoken form of this quantity.'
			);
		if (/^[0-9]+$/u.test(selected) && parseQuantityInteger(selected) !== facts.value)
			return refuse(
				'invalid-input',
				'The selected digits do not match the exact confirmed quantity.'
			);
		if (/\p{Nd}/u.test(selected) && !/^[0-9]+$/u.test(selected) && selected !== facts.digitForm)
			return refuse(
				'invalid-input',
				'Confirm the exact digit form of the complete selected quantity.'
			);
		if (
			facts.spokenForm !== undefined &&
			!/\p{Nd}/u.test(selected) &&
			selected !== facts.spokenForm
		)
			return refuse(
				'invalid-input',
				'The confirmed spoken form must match the selected words exactly.'
			);
		const form = resolveDecision(document, projection, {
			kind: 'setForm',
			range: action.range,
			profile: facts.profile,
			text: checked.value
		});
		if (!form.ok) return form;
		const owner = form.value.document.owners.find(
			(entry) => entry.from <= range.from && range.to <= entry.to
		)!;
		const converted = form.value.document;
		converted.decisions = [
			...converted.decisions.filter(
				(decision) =>
					decision.kind !== 'quantity' ||
					decision.from !== range.from ||
					decision.to !== range.to ||
					decision.profile !== facts.profile
			),
			{
				id: allocateId(converted, 'decision'),
				kind: 'quantity',
				profile: facts.profile,
				ownerId: owner.id,
				ownerRevision: owner.revision,
				...range,
				facts
			}
		];
		const rendered = renderProfile(converted, projection.profile);
		return rendered.ok
			? {
					ok: true,
					value: { document: converted, projection: rendered.value, changes: form.value.changes }
				}
			: rendered;
	} else {
		if (!action.facts || typeof action.facts !== 'object')
			return refuse('invalid-input', 'Confirm an interval against its recording.');
		const facts = { ...action.facts, language: next.defaultLanguage };
		if (
			typeof facts.recordingId !== 'string' ||
			typeof facts.currentRecordingId !== 'string' ||
			facts.recordingId.length > 2000 ||
			(next.recordingId !== undefined && next.recordingId !== facts.currentRecordingId)
		)
			return refuse(
				'invalid-input',
				'Confirm this interval against the currently attached recording.'
			);
		const checked = decideInstrumentalRepresentation(facts);
		if (!checked.ok)
			return refuse(
				checked.reason === 'invalid-fact' ? 'invalid-input' : 'unavailable-capability',
				checked.message
			);
		const before = next.sections.findIndex((section) => section.id === facts.beforeSectionId);
		const after = next.sections[before + 1];
		if (
			before < 0 ||
			after?.id !== facts.afterSectionId ||
			!next.sections[before]?.type ||
			!after.type ||
			next.sections[before]!.at >= after.at
		)
			return refuse(
				'invalid-input',
				'Confirm the types of two adjacent sections with lyrics before placing an instrumental interval between them.'
			);
		if (action.markerRange !== undefined) {
			const range = action.markerRange;
			if (
				!range ||
				!Number.isSafeInteger(range.from) ||
				!Number.isSafeInteger(range.to) ||
				range.from < 0 ||
				range.from >= range.to ||
				range.to > projection.text.length ||
				projection.text.slice(range.from, range.to) !== '#INSTRUMENTAL'
			)
				return refuse(
					'invalid-input',
					'Select exactly the existing #INSTRUMENTAL marker to confirm it.'
				);
			const lines = scanPhysicalLines(projection.text);
			const index = lines.findIndex((line) => line.from === range.from && line.to === range.to);
			const line = lines[index];
			if (!line || line.lineEnding === 'none')
				return refuse(
					'invalid-input',
					'The confirmed marker must occupy its own complete line before the following section.'
				);
			const blank = lines[index + 1];
			const hasBlank = blank?.text === '' && blank.lineEnding !== 'none';
			const to = hasBlank ? blank.lineEndingRange.to : line.lineEndingRange.to;
			const shared = {
				from: contentOffset(projection, range.from, 1),
				to: contentOffset(projection, to, -1)
			};
			const overlaps = (detail: TextRange) => detail.from < shared.to && shared.from < detail.to;
			if (
				shared.to !== after.at ||
				shared.from < next.sections[before]!.at ||
				!next.content.slice(next.sections[before]!.at, shared.from).trim()
			)
				return refuse(
					'invalid-input',
					'The selected marker and at most one following blank line must sit immediately before the confirmed next section, after the preceding lyrics.'
				);
			if (
				projection.segments.some(
					(segment) => segment.kind === 'generated' && segment.from < to && range.from < segment.to
				) ||
				[...next.wrappers, ...next.forms, ...next.voices, ...next.languageRanges].some(overlaps) ||
				next.decisions.some((decision) => 'from' in decision && overlaps(decision)) ||
				next.lines.some((entry) => entry.time !== undefined && overlaps(entry)) ||
				next.links.some(
					(link) =>
						link.holes.some(overlaps) ||
						link.passages?.some((passage) => passage.members.some(overlaps)) ||
						link.detached?.some(overlaps)
				)
			)
				return refuse(
					'invalid-input',
					'The selected marker carries retained details. Remove or reattach those details before confirming it as instrumental structure.'
				);
			const stripped = reconcileEdit(document, projection, {
				changes: [{ from: range.from, to, insert: '' }],
				mirror: false
			});
			if (!stripped.ok) return stripped;
			const confirmed = resolveFactDecision(stripped.value.document, stripped.value.projection, {
				kind: 'confirmInstrumentalInterval',
				facts
			});
			if (!confirmed.ok) return confirmed;
			const decision = confirmed.value.document.decisions.find(
				(entry) =>
					entry.kind === 'instrumental-interval' &&
					entry.facts.beforeSectionId === facts.beforeSectionId &&
					entry.facts.afterSectionId === facts.afterSectionId
			)!;
			const ending = projection.text.slice(line.lineEndingRange.from, line.lineEndingRange.to);
			const markerText = projection.text.slice(range.from, to) + (hasBlank ? '' : ending);
			const classified: ConversionDocument = {
				...confirmed.value.document,
				markers: confirmed.value.document.markers.map((marker) =>
					marker.decisionId === decision.id ? { ...marker, text: markerText } : marker
				)
			};
			const rendered = renderProfile(classified, projection.profile);
			if (!rendered.ok) return rendered;
			return {
				ok: true,
				value: {
					document: classified,
					projection: rendered.value,
					changes:
						rendered.value.text === projection.text
							? []
							: [{ from: 0, to: projection.text.length, insert: rendered.value.text }]
				}
			};
		}
		const owner = next.owners.find((entry) => entry.from <= after.at && after.at < entry.to);
		if (!owner) return refuse('invalid-input', 'The interval must have a following lyric section.');
		const existing = next.decisions.find(
			(decision) =>
				decision.kind === 'instrumental-interval' &&
				decision.facts.beforeSectionId === facts.beforeSectionId &&
				decision.facts.afterSectionId === facts.afterSectionId
		);
		const decisionId = existing?.id ?? allocateId(next, 'decision');
		next.decisions = [
			...next.decisions.filter((decision) => decision.id !== decisionId),
			{
				id: decisionId,
				kind: 'instrumental-interval',
				profile: 'musixmatch',
				ownerId: owner.id,
				ownerRevision: owner.revision,
				from: after.at,
				to: after.at,
				facts
			}
		];
		const marker = next.markers.find((entry) => entry.decisionId === decisionId);
		next.markers = [
			...next.markers.filter((entry) => entry.decisionId !== decisionId),
			{
				id: marker?.id ?? allocateId(next, 'marker'),
				at: after.at,
				order: marker?.order ?? next.markers.length,
				profile: 'musixmatch',
				text: '#INSTRUMENTAL\n\n',
				decisionId
			}
		];
		next.recordingId = facts.currentRecordingId;
	}
	const rendered = renderProfile(next, projection.profile);
	if (!rendered.ok) return rendered;
	return {
		ok: true,
		value: {
			document: next,
			projection: rendered.value,
			changes:
				rendered.value.text === projection.text
					? []
					: [{ from: 0, to: projection.text.length, insert: rendered.value.text }]
		}
	};
}
