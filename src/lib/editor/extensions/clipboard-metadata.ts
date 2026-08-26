// Decision record: docs/subsystems/editor.md — read it before changing this file, and update it with any behavior change.
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { isSectionHeaderLine } from '$lib/core/parser.js';
import { annotationSpansFor } from './annotation-spans.js';
import type { TextRange } from '$lib/core/types.js';
import {
	clipboardHtml,
	lineStartOffsets,
	metadataFromClipboardHtml
} from '../clipboard-metadata.js';
import type { ClipboardLink, ClipboardMetadata } from '../clipboard-metadata.js';
import { sectionBodyRange } from '../section-links.js';
import { editorCallbacksField, parsedDocumentForState } from './editor-state.js';
import { anchorLineEffect, lineAnchorsFor } from './line-anchors.js';
import {
	linkHolesField,
	sectionLinksFor,
	setLinkHolesEffect,
	setSectionLinkEffect
} from './section-links.js';

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
		links.push(
			holes.length > 0
				? { lines: kept.map((member) => member.line - firstLine), holes }
				: { lines: kept.map((member) => member.line - firstLine) }
		);
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
	const media = state.field(editorCallbacksField, false)?.onRequestMediaSource?.();
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
	const landed: TextRange[] = [];
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
		effects.push(setSectionLinkEffect.of({ headers }));
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
			if (from <= holeTo) landed.push({ from, to: holeTo });
		}
	}
	if (effects.length === 0) return;
	const existing = state.field(linkHolesField, false) ?? [];
	view.dispatch({ effects: [...effects, setLinkHolesEffect.of([...existing, ...landed])] });
	state.field(editorCallbacksField, false)?.onSectionLinksChanged?.();
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
 */
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
	// Positions are stated in the new document's coordinates, which is what the
	// anchor field reads its effect against — `from` plus an offset into the
	// insert is that position whether or not the paste landed mid-line.
	const anchors = metadata.anchors.map((anchor) =>
		anchorLineEffect.of({ pos: from + (starts[anchor.line] ?? 0), time: anchor.time })
	);
	event.preventDefault();
	view.dispatch({
		changes: { from, to, insert: text },
		selection: { anchor: from + text.length },
		effects: anchors,
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
	return EditorView.domEventHandlers({
		copy: (event, view) => claimCopy(event, view, false),
		cut: (event, view) => claimCopy(event, view, true),
		paste: (event, view) => claimPaste(event, view)
	});
}
