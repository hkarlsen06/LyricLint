// Decision record: docs/subsystems/editor.md — read it before changing this file, and update it with any behavior change.
import type { EditorState, Extension } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { isSectionHeaderLine } from '$lib/core/parser.js';
import { annotationSpansFor } from './annotation-spans.js';
import type { LinkHole, LinkPassageOccurrence, SectionLink, TextRange } from '$lib/core/types.js';
import type { ProfileId } from '$lib/profiles/types.js';
import { validateLinkPassages } from '$lib/core/link-record.js';
import {
	clipboardHtml,
	lineStartOffsets,
	metadataFromClipboardHtml
} from '../clipboard-metadata.js';
import type { ClipboardLink, ClipboardMetadata } from '../clipboard-metadata.js';
import { sectionBodyRange } from '../section-links.js';
import { editorCallbacksField, parsedDocumentForState } from './editor-state.js';
import { anchorLineEffect, lineAnchorsFor } from './line-anchors.js';
import { pastedSectionMetadata, sectionLinksFor, setSectionLinkEffect } from './section-links.js';
import { setSectionLinksEffect } from './section-links.js';
import { setLineAnchorsEffect } from './line-anchors.js';
import { conversionForState, profileForState } from './conversion-state.js';
import { profileProjection, setConversionStateEffect } from './conversion-effects.js';
import { sliceDocument, pasteDocument } from '$lib/conversion/clipboard.js';
import { importDocument } from '$lib/conversion/import.js';
import { renderProfile } from '$lib/conversion/projection.js';
import { createConversionEnvelope } from '$lib/persistence/conversion.js';
import {
	clipboardReviewField,
	clipboardReviewHistory,
	clipboardReviewFor,
	setClipboardReviewEffect,
	type PendingClipboardReview
} from './clipboard-review.js';
import { profilePolicyVersions } from '$lib/profiles/versions.js';
import { editorContextField } from './editor-state.js';

/**
 * What a copy of `[from, to)` carries beside its text, or `undefined` for a
 * copy that is only text — which is most of them, and which is deliberately
 * left to CodeMirror's own handler so this extension cannot drift from the
 * default copy by so much as a line separator.
 *
 * Anchors travel for every fragment line that holds one. Links travel only
 * where the group is wholly inside the copy: a member's header line has to
 * start inside the fragment and its whole body has to end there, because a
 * link is re-seated by line arithmetic on the other side and a section the
 * paste only has half of has no lines to seat it on. Members outside the copy
 * are dropped and the survivors carry on — the same rule deleting a linked
 * section follows — and fewer than two survivors is not a link.
 */
function metadataForRange(
	state: EditorState,
	from: number,
	to: number
): ClipboardMetadata | undefined {
	const converted = conversionForState(state);
	if (converted && !converted.recovery) {
		const fragment = sliceDocument(converted.envelope.model, converted.projection, { from, to });
		if (fragment.ok) {
			const conversion = createConversionEnvelope(
				fragment.value,
				converted.envelope.profile,
				converted.envelope.policyVersions
			);
			const referenced = new Set(fragment.value.voices.flatMap((voice) => voice.performerIds));
			const performers = (state.field(editorContextField, false)?.performers ?? []).filter(
				(performer) => referenced.has(performer.id)
			);
			return {
				lines: state.sliceDoc(from, to).split('\n').length,
				anchors: [],
				links: [],
				conversion,
				performers: performers.map((performer) => ({
					...performer,
					aliases: [...performer.aliases]
				}))
			};
		}
		// A partial delimiter cannot carry somebody else's hidden metadata.
		return undefined;
	}
	const doc = state.doc;
	const firstLine = doc.lineAt(from).number;
	const lastLine = doc.lineAt(to).number;
	// A copy ending exactly at a line's start carries the newline before it and
	// an empty final fragment line — which the count states, and which no anchor
	// below may claim, because none of that line's text came along.
	const includesLine = (line: number): boolean => line < lastLine || to > doc.line(lastLine).from;

	const anchors = lineAnchorsFor(state)
		.filter(
			(anchor) => anchor.line >= firstLine && anchor.line <= lastLine && includesLine(anchor.line)
		)
		.map((anchor) => ({ line: anchor.line - firstLine, time: anchor.time }));

	const links: ClipboardLink[] = [];
	const parsed = parsedDocumentForState(state);
	for (const link of sectionLinksFor(state)) {
		const kept: { line: number; lastBodyLine: number }[] = [];
		for (const headerLine of link.lines) {
			const header = doc.line(headerLine);
			// Starting *at* the fragment's edge is the one way a header line can be
			// whole: a copy that begins mid-line carries only that line's tail, and
			// a header missing its opening bracket is not a header on the far side.
			if (header.from < from) continue;
			const body = sectionBodyRange(parsed, header.from);
			if (!body || body.to > to) continue;
			kept.push({ line: headerLine, lastBodyLine: doc.lineAt(body.to).number });
		}
		if (kept.length < 2) continue;
		const holes = (link.holes ?? [])
			.filter((hole) =>
				kept.some((member) => hole.line >= member.line && hole.endLine <= member.lastBodyLine)
			)
			.map((hole) => ({
				line: hole.line - firstLine,
				column: hole.column,
				endLine: hole.endLine - firstLine,
				endColumn: hole.endColumn
			}));
		const carried: ClipboardLink = { lines: kept.map((member) => member.line - firstLine) };
		if (holes.length > 0) carried.holes = holes;
		const keptHeaders = new Set(kept.map((member) => member.line));
		const relative = (member: LinkPassageOccurrence): LinkPassageOccurrence => ({
			...member,
			headerLine: member.headerLine - firstLine,
			line: member.line - firstLine,
			endLine: member.endLine - firstLine
		});
		if (link.passages !== undefined) {
			carried.passages = link.passages.flatMap((passage) => {
				const members = passage.members.filter((member) => keptHeaders.has(member.headerLine));
				return members.length >= 2 ? [{ members: members.map(relative) }] : [];
			});
		}
		if (link.detached !== undefined) {
			carried.detached = link.detached
				.filter((member) => keptHeaders.has(member.headerLine))
				.map(relative);
		}
		links.push(carried);
	}

	if (anchors.length === 0 && links.length === 0) return undefined;
	return { lines: lastLine - firstLine + 1, anchors, links };
}

/**
 * Whether the selection the browser is copying is the editor's own.
 *
 * A page-wide selection that reaches into the editor bubbles its copy event
 * through `.cm-content`, and CodeMirror's own handler steps aside for it by
 * exactly this test — the anchor of the live DOM selection — so this one has
 * to as well, or it would overwrite a copy of half the page with whatever the
 * editor's internal selection happened to be.
 */
function copiedSelectionIsOurs(view: EditorView): boolean {
	const selection = view.contentDOM.ownerDocument.getSelection();
	const anchor = selection?.anchorNode;
	if (!anchor) return false;
	return view.contentDOM.contains(anchor.nodeType === Node.TEXT_NODE ? anchor.parentNode : anchor);
}

/**
 * Own the copy where there is something to carry.
 *
 * Owning it outright rather than adding a flavor beside CodeMirror's, because
 * the built-in handler opens with `clearData()` and would wipe anything set
 * before it ran. The plain flavor is the selection's own slice, which for the
 * one shape this claims — a single non-empty range — is byte for byte what the
 * built-in writes; every other selection shape, and every copy with nothing to
 * carry, is left to CodeMirror untouched.
 */
function claimCopy(event: ClipboardEvent, view: EditorView, cut: boolean): boolean {
	const { state } = view;
	if (!event.clipboardData || state.selection.ranges.length !== 1) return false;
	const range = state.selection.main;
	if (range.empty || !copiedSelectionIsOurs(view)) return false;
	const metadata = metadataForRange(state, range.from, range.to);
	if (!metadata) return false;

	// The source rides only where the copy already carries something — it
	// qualifies the timings, and a copy that is only words stays an ordinary
	// copy. The shell answers for remote sources alone; a local file is a handle
	// only this browser can redeem.
	const hasSongDetails =
		metadata.anchors.length > 0 ||
		metadata.links.length > 0 ||
		(metadata.conversion?.model.lines.some((line) => line.time !== undefined) ?? false) ||
		(metadata.conversion?.model.links.length ?? 0) > 0;
	const media = hasSongDetails
		? state.field(editorCallbacksField, false)?.onRequestMediaSource?.()
		: undefined;
	const carried = media ? { ...metadata, media } : metadata;

	const text = state.sliceDoc(range.from, range.to);
	event.preventDefault();
	event.clipboardData.clearData();
	event.clipboardData.setData('text/plain', text);
	event.clipboardData.setData('text/html', clipboardHtml(text, carried));
	if (cut && !state.readOnly) {
		view.dispatch({
			changes: { from: range.from, to: range.to, insert: '' },
			scrollIntoView: true,
			userEvent: 'delete.cut'
		});
	}
	return true;
}

/**
 * Re-seat the carried links on the lines the paste just landed.
 *
 * Through `setSectionLinkEffect`, one per group, exactly as the picker links —
 * a real change the history records and `onSectionLinksChanged` reports — and
 * never the restore effect, which is the draft being read back and is
 * deliberately invisible to the shell's save.
 *
 * It runs as its own transaction after the insert because a membership can only
 * be seated on positions that exist: the effect maps its headers through the
 * transaction's own changes, and a position inside text an insertion is still
 * creating is not reachable from the old document by any mapping.
 *
 * A header pasted into the middle of an existing line is not a header any
 * more, and the whole group stands down rather than one member at a time —
 * the members' runs correspond by ordinal, and a partial group would carry
 * another member's differences under the wrong words.
 *
 * A run is measured against the **fragment's** own lines, never the document's,
 * and one that does not fit them is dropped rather than clamped. Clamping to the
 * landed line is wrong in both directions: a paste into the middle of a line
 * leaves the document line longer than the fragment's at both ends, so an
 * overshooting column — which is only ever a payload lying about text it never
 * carried — would claim words that were already in the draft as a difference the
 * copy set aside. Dropping one is `readHole`'s own trade: the link is still good,
 * and a re-tick costs less than a difference drawn over somebody else's words.
 */
function applyLinks(
	view: EditorView,
	metadata: ClipboardMetadata,
	base: number,
	starts: readonly number[],
	text: string
): void {
	const { state } = view;
	const effects = [];

	// The line as the copy carried it: up to the break before the next one, which
	// is not part of it, and to the fragment's end for the last.
	const fragmentLineLength = (index: number): number | undefined => {
		const start = starts[index];
		if (start === undefined) return undefined;
		const next = starts[index + 1];
		return (next === undefined ? text.length : next - 1) - start;
	};
	for (const link of metadata.links) {
		const headers = link.lines.map((relative) => base + (starts[relative] ?? 0));
		const intact = headers.every((position) => {
			const line = state.doc.lineAt(position);
			return (
				line.from === position &&
				isSectionHeaderLine(line.text, {
					annotations: annotationSpansFor(state.doc),
					lineFrom: line.from
				})
			);
		});
		if (!intact) continue;
		if (link.passages !== undefined) {
			const validated = validateLinkPassages(link, link.lines, text.split('\n'), 0);
			const firstLandedLine = state.doc.lineAt(base).number;
			const absolute = (member: LinkPassageOccurrence): LinkPassageOccurrence => ({
				...member,
				headerLine: member.headerLine + firstLandedLine,
				line: member.line + firstLandedLine,
				endLine: member.endLine + firstLandedLine
			});
			const record: SectionLink = {
				lines: headers.map((header) => state.doc.lineAt(header).number),
				passages: (validated.passages ?? []).map((passage) => ({
					members: passage.members.map(absolute)
				}))
			};
			if (validated.detached !== undefined) record.detached = validated.detached.map(absolute);
			effects.push(setSectionLinkEffect.of({ headers, record }));
			continue;
		}
		const holes: LinkHole[] = [];
		for (const hole of link.holes ?? []) {
			const startLength = fragmentLineLength(hole.line);
			const endLength = fragmentLineLength(hole.endLine);
			if (startLength === undefined || endLength === undefined) continue;
			if (hole.column > startLength || hole.endColumn > endLength) continue;
			// Fragment coordinates land through `base` and the fragment's own line
			// starts, exactly as the anchors above do — a document line is a different
			// length from the fragment line inside it whenever a paste lands mid-line.
			const from = base + (starts[hole.line] ?? 0) + hole.column;
			const holeTo = base + (starts[hole.endLine] ?? 0) + hole.endColumn;
			if (from <= holeTo) {
				const start = state.doc.lineAt(from);
				const end = state.doc.lineAt(holeTo);
				holes.push({
					line: start.number,
					column: from - start.from,
					endLine: end.number,
					endColumn: holeTo - end.from
				});
			}
		}
		const record: SectionLink = { lines: headers.map((header) => state.doc.lineAt(header).number) };
		if (holes.length > 0) record.holes = holes;
		effects.push(setSectionLinkEffect.of({ headers, record }));
	}
	if (effects.length === 0) return;
	view.dispatch({ effects });
	state.field(editorCallbacksField, false)?.onSectionLinksChanged?.();
}

/**
 * The carried timings that still run forward at the paste site, in fragment
 * order.
 *
 * Anchors are absolute moments, so a copy is only keeping its times while
 * they stay ordered where they land: after the nearest anchor on a line wholly
 * before the pasted range and before the nearest anchor on a line wholly after
 * it, and strictly increasing among themselves. Anchors on lines the paste
 * overlaps are left out of both bounds — a replaced range's own timings go
 * with it, and an insertion splitting a line collides with that line's anchor
 * rather than ordering against it. Anything else is dropped while the words
 * still land; a re-tap costs less than a jump into the wrong verse.
 */
function chronologicalAnchors(
	state: EditorState,
	metadata: ClipboardMetadata,
	from: number,
	to: number
): ClipboardMetadata['anchors'] {
	let prev: number | undefined;
	let next: number | undefined;
	for (const anchor of lineAnchorsFor(state)) {
		const line = state.doc.line(anchor.line);
		if (line.to < from) {
			if (prev === undefined || anchor.time > prev) prev = anchor.time;
		} else if (line.from >= to) {
			if (next === undefined || anchor.time < next) next = anchor.time;
		}
	}
	const ordered = [...metadata.anchors].sort((left, right) => left.line - right.line);
	const kept: ClipboardMetadata['anchors'] = [];
	let lower = prev;
	for (const anchor of ordered) {
		if (lower !== undefined && anchor.time <= lower) continue;
		if (next !== undefined && anchor.time >= next) continue;
		kept.push(anchor);
		lower = anchor.time;
	}
	return kept;
}

/**
 * A paste carrying our own flavor lands the text and its metadata; anything
 * else is handed back to CodeMirror untouched.
 *
 * The plain flavor is what is inserted — the HTML never reaches the document —
 * and the fragment's line count is checked against it first: a clipboard
 * manager that merged flavors from two copies would otherwise land timings
 * measured against somebody else's lines, and the honest answer to that is the
 * text alone, through the default path.
 *
 * A carried timing lands only where it still runs forward: pasting two timed
 * lines later into their own section would otherwise re-plant their earlier
 * moments behind a later anchor, and everything downstream reads anchors as
 * ordered. Timings that would arrive before the anchor above the paste or at
 * or past the anchor below it — or behind a carried timing before them — are
 * dropped while the words still land.
 */

function conversionForPaste(state: EditorState) {
	const existing = conversionForState(state);
	if (existing) return existing;
	const context = state.field(editorContextField, false);
	const imported = importDocument({
		text: state.doc.toString(),
		profile: 'genius',
		language: context?.language,
		performers: context?.performers,
		lineAnchors: lineAnchorsFor(state),
		sectionLinks: sectionLinksFor(state)
	});
	if (!imported.ok) return undefined;
	const rendered = renderProfile(imported.value, 'genius');
	if (!rendered.ok) return undefined;
	return {
		envelope: createConversionEnvelope(imported.value, 'genius', profilePolicyVersions),
		projection: rendered.value
	};
}

/** An explicit review action may convert the copied fragment into the receiving format. */
export function prepareInterpretation(
	view: EditorView,
	sourceProfile: ProfileId,
	range: TextRange
): { ok: true } | { ok: false; message: string } {
	if (view.state.readOnly || view.composing || conversionForState(view.state)?.recovery)
		return {
			ok: false,
			message: 'Finish or recover the current edit before interpreting a passage.'
		};
	if (
		!Number.isInteger(range.from) ||
		!Number.isInteger(range.to) ||
		range.from < 0 ||
		range.from >= range.to ||
		range.to > view.state.doc.length
	)
		return { ok: false, message: 'Select the passage whose source format you want to interpret.' };
	const text = view.state.doc.sliceString(range.from, range.to);
	const context = view.state.field(editorContextField, false);
	const imported = importDocument({
		text,
		profile: sourceProfile,
		language: context?.language,
		performers: context?.performers
	});
	if (!imported.ok) return { ok: false, message: imported.refusal.message };
	const referenced = new Set(imported.value.voices.flatMap((voice) => voice.performerIds));
	const pending = {
		...range,
		text,
		conversion: createConversionEnvelope(imported.value, sourceProfile, profilePolicyVersions),
		performers: (context?.performers ?? []).filter((performer) => referenced.has(performer.id))
	};
	view.dispatch({
		effects: setClipboardReviewEffect.of(pending),
		annotations: isolateHistory.of('full')
	});
	return { ok: true };
}

export function applyClipboardReview(
	view: EditorView
): { ok: true } | { ok: false; message: string } {
	const pending = clipboardReviewFor(view.state);
	if (!pending) return { ok: false, message: 'These copied details are no longer available.' };
	if (view.state.readOnly || view.composing)
		return { ok: false, message: 'Finish the current edit before applying copied details.' };
	const current = conversionForPaste(view.state);
	if (!current || current.recovery)
		return {
			ok: false,
			message: 'Recover the document associations before applying copied details.'
		};
	const pasted = pasteDocument(
		current.envelope.model,
		current.projection,
		pending,
		pending.conversion.model,
		current.envelope.profile,
		pending.performers,
		view.state.field(editorContextField, false)?.performers
	);
	if (!pasted.ok) return { ok: false, message: pasted.refusal.message };
	const callbacks = view.state.field(editorCallbacksField, false);
	if (pasted.value.performers.length) callbacks?.onPerformersPasted?.(pasted.value.performers);
	const insert = pasted.value.changes[0]?.insert ?? '';
	view.dispatch({
		changes: pasted.value.changes,
		selection: { anchor: pending.from + insert.length },
		effects: [
			setConversionStateEffect.of({
				envelope: {
					...current.envelope,
					model: pasted.value.document,
					projectionText: pasted.value.projection.text
				},
				projection: pasted.value.projection
			}),
			setLineAnchorsEffect.of(pasted.value.projection.lineAnchors),
			setSectionLinksEffect.of(pasted.value.projection.sectionLinks),
			setClipboardReviewEffect.of(undefined)
		],
		annotations: [
			profileProjection.of(true),
			pastedSectionMetadata.of(true),
			isolateHistory.of('full')
		],
		scrollIntoView: true,
		userEvent: 'input.clipboard-review'
	});
	if (pending.media) callbacks?.onMediaSourcePasted?.(pending.media);
	return { ok: true };
}

export function dismissClipboardReview(view: EditorView): void {
	view.dispatch({ effects: setClipboardReviewEffect.of(undefined) });
}

function claimPaste(event: ClipboardEvent, view: EditorView): boolean {
	const data = event.clipboardData;
	if (!data) return false;
	const metadata = metadataFromClipboardHtml(data.getData('text/html'));
	if (!metadata) return false;
	if (view.state.readOnly || view.state.selection.ranges.length !== 1) return false;
	const text = data.getData('text/plain').replace(/\r\n?/g, '\n');
	if (!text) return false;
	const starts = lineStartOffsets(text);
	if (starts.length !== metadata.lines) return false;

	const { from, to } = view.state.selection.main;
	if (metadata.conversion) {
		const callbacks = view.state.field(editorCallbacksField, false);
		const foreign = metadata.conversion.profile !== profileForState(view.state);
		if (metadata.conversion.projectionText !== text) {
			callbacks?.onAnnouncement(
				'The copied details did not match the pasted lyrics. Only the text was pasted.'
			);
			return false;
		}
		const current = foreign ? conversionForState(view.state) : conversionForPaste(view.state);
		if (current && !current.recovery && !foreign) {
			const pasted = pasteDocument(
				current.envelope.model,
				current.projection,
				{ from, to },
				metadata.conversion.model,
				metadata.conversion.profile,
				metadata.performers,
				view.state.field(editorContextField, false)?.performers
			);
			if (pasted.ok) {
				event.preventDefault();
				if (pasted.value.performers.length)
					callbacks?.onPerformersPasted?.(pasted.value.performers);
				view.dispatch({
					changes: pasted.value.changes,
					selection: { anchor: from + text.length },
					effects: [
						setConversionStateEffect.of({
							envelope: {
								...current.envelope,
								model: pasted.value.document,
								projectionText: pasted.value.projection.text
							},
							projection: pasted.value.projection
						}),
						setLineAnchorsEffect.of(pasted.value.projection.lineAnchors),
						setSectionLinksEffect.of(pasted.value.projection.sectionLinks)
					],
					annotations: [profileProjection.of(true), pastedSectionMetadata.of(true)],
					scrollIntoView: true,
					userEvent: 'input.paste'
				});
				if (metadata.media) callbacks?.onMediaSourcePasted?.(metadata.media);
				return true;
			}
		}
		let review: PendingClipboardReview | undefined;
		if (foreign) {
			review = {
				from,
				to: from + text.length,
				text,
				conversion: metadata.conversion,
				performers: metadata.performers ?? []
			};
			if (metadata.media) review.media = metadata.media;
		}
		event.preventDefault();
		view.dispatch({
			changes: { from, to, insert: text },
			selection: { anchor: from + text.length },
			effects: setClipboardReviewEffect.of(review),
			annotations: pastedSectionMetadata.of(true),
			scrollIntoView: true,
			userEvent: 'input.paste'
		});
		callbacks?.onAnnouncement(
			foreign
				? 'Pasted exact lyrics. Review the copied details in Song before applying their different lyric format.'
				: 'Pasted exact lyrics. The copied details could not be attached safely at this position.'
		);
		return true;
	}
	// Positions are stated in the new document's coordinates, which is what the
	// anchor field reads its effect against — `from` plus an offset into the
	// insert is that position whether or not the paste landed mid-line.
	const anchors = chronologicalAnchors(view.state, metadata, from, to).map((anchor) =>
		anchorLineEffect.of({ pos: from + (starts[anchor.line] ?? 0), time: anchor.time })
	);
	event.preventDefault();
	view.dispatch({
		changes: { from, to, insert: text },
		selection: { anchor: from + text.length },
		effects: anchors,
		annotations: pastedSectionMetadata.of(true),
		scrollIntoView: true,
		userEvent: 'input.paste'
	});
	applyLinks(view, metadata, from, starts, text);
	// Handed to the shell rather than acted on, because attachment is the
	// shell's: whether this draft already has a song, and what a pending source
	// waits on, are decisions the editor has no standing in.
	if (metadata.media) {
		view.state.field(editorCallbacksField, false)?.onMediaSourcePasted?.(metadata.media);
	}
	return true;
}

/**
 * A copy carries its timings and links in a second flavor the plain text never
 * learns about; a paste of that flavor puts them back. Everything else — other
 * selection shapes, foreign clipboards, mismatched flavors — falls through to
 * CodeMirror's own handlers, because a clipboard this extension has no whole
 * answer for is one it must not stand in front of.
 */
export function clipboardMetadata(): Extension {
	return [
		clipboardReviewField,
		clipboardReviewHistory,
		EditorView.domEventHandlers({
			copy: (event, view) => claimCopy(event, view, false),
			cut: (event, view) => claimCopy(event, view, true),
			paste: (event, view) => claimPaste(event, view)
		})
	];
}
