import type { Extension } from '@codemirror/state';
import { ViewPlugin } from '@codemirror/view';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { canAssignVoiceGroup } from '$lib/performers/transform.js';
import type { SelectionAnchor } from '../contracts.js';
import { linkableHeaderAt } from '../section-links.js';
import { editorComposingField, editorContextField, parsedDocumentForView } from './editor-state.js';

const VIEWPORT_MARGIN = 8;

function isWhitespaceSelection(view: EditorView, from: number, to: number): boolean {
	return view.state.doc.sliceString(from, to).trim().length === 0;
}

export function selectionAnchorForView(
	view: EditorView,
	pointerDriven = false
): SelectionAnchor | undefined {
	const selection = view.state.selection.main;
	const from = Math.min(selection.anchor, selection.head);
	const to = Math.max(selection.anchor, selection.head);
	if (
		from === to ||
		isWhitespaceSelection(view, from, to) ||
		view.composing ||
		view.state.field(editorComposingField)
	) {
		return undefined;
	}

	const start = view.coordsAtPos(from, 1);
	const end = view.coordsAtPos(to, -1);
	const editorRect = view.dom.getBoundingClientRect();
	const rawLeft = Math.min(start?.left ?? editorRect.left, end?.left ?? editorRect.left);
	const rawRight = Math.max(start?.right ?? editorRect.right, end?.right ?? editorRect.right);
	const rawTop = Math.min(start?.top ?? editorRect.top, end?.top ?? editorRect.top);
	const rawBottom = Math.max(start?.bottom ?? editorRect.bottom, end?.bottom ?? editorRect.bottom);
	const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
	const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
	const left = Math.min(Math.max(rawLeft, VIEWPORT_MARGIN), viewportWidth - VIEWPORT_MARGIN);
	const right = Math.min(Math.max(rawRight, left), viewportWidth - VIEWPORT_MARGIN);
	const top = Math.min(Math.max(rawTop, VIEWPORT_MARGIN), viewportHeight - VIEWPORT_MARGIN);
	const bottom = Math.min(Math.max(rawBottom, top), viewportHeight - VIEWPORT_MARGIN);
	const spaceAbove = top;
	const spaceBelow = viewportHeight - bottom;
	const linkHeader = pointerDriven
		? linkableHeaderAt(
				parsedDocumentForView(view),
				view.state.field(editorContextField, false)?.languagePack,
				from,
				to
			)
		: undefined;

	return {
		range: { from, to },
		rect: {
			left,
			top,
			right,
			bottom,
			width: Math.max(0, right - left),
			height: Math.max(0, bottom - top)
		},
		prefer: spaceAbove > spaceBelow ? 'above' : 'below',
		// Short-circuited on the gesture, so the parse never runs for the anchors
		// this plugin reports on every settled scroll, geometry change and typing
		// pause — which is nearly all of them.
		offersAssignment:
			pointerDriven && canAssignVoiceGroup(parsedDocumentForView(view), { anchor: from, head: to }),
		...(linkHeader ? { linkHeader } : {})
	};
}

class SelectionAnchorReporter {
	private timer: number | undefined;
	private pendingPointerDriven = false;

	constructor(
		readonly view: EditorView,
		readonly callback: (anchor: SelectionAnchor | undefined) => void,
		readonly settleDelay: number
	) {
		this.schedule(false);
	}

	reportAfterSettle(): void {
		this.schedule();
	}

	update(update: ViewUpdate): void {
		if (update.selectionSet) {
			// `select.pointer` and not `select`: a keyboard selection is nearly
			// always a step inside an edit — Shift-arrow to retype a word,
			// Shift-End to delete the rest of a line — and a card that opens itself
			// over the caret mid-edit is interrupting the very gesture it read as an
			// invitation. A drag or a double-click is terminal: the button came up
			// and the user is looking at what they picked. The keyboard keeps its
			// own way in, `Ctrl-Alt-P`, which is a press that meant only this.
			const pointerDriven = update.transactions.some((transaction) =>
				transaction.isUserEvent('select.pointer')
			);
			this.schedule(pointerDriven);
			return;
		}
		if (
			update.docChanged ||
			update.viewportChanged ||
			update.geometryChanged ||
			update.transactions.some((transaction) => transaction.effects.length > 0)
		) {
			this.schedule();
		}
	}

	private schedule(pointerDriven?: boolean): void {
		if (pointerDriven !== undefined) {
			this.pendingPointerDriven = pointerDriven;
		}
		if (this.timer !== undefined) {
			window.clearTimeout(this.timer);
		}
		this.timer = window.setTimeout(() => {
			this.timer = undefined;
			const selectionWasPointerDriven = this.pendingPointerDriven;
			this.pendingPointerDriven = false;
			this.callback(selectionAnchorForView(this.view, selectionWasPointerDriven));
		}, this.settleDelay);
	}

	destroy(): void {
		if (this.timer !== undefined) {
			window.clearTimeout(this.timer);
		}
	}
}

/**
 * Report a settled selection's clamped screen geometry without dispatching.
 */
export function selectionAnchorPlugin(
	callback: (anchor: SelectionAnchor | undefined) => void,
	settleDelay = 80
): Extension {
	return ViewPlugin.define((view) => new SelectionAnchorReporter(view, callback, settleDelay));
}
