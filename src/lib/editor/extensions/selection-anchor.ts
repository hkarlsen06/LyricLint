import type { Extension } from '@codemirror/state';
import { ViewPlugin } from '@codemirror/view';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import type { SelectionAnchor } from '../contracts.js';
import { editorComposingField } from './editor-state.js';

const VIEWPORT_MARGIN = 8;

function isWhitespaceSelection(view: EditorView, from: number, to: number): boolean {
	return view.state.doc.sliceString(from, to).trim().length === 0;
}

export function selectionAnchorForView(
	view: EditorView,
	userDriven = false
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
		userDriven
	};
}

class SelectionAnchorReporter {
	private timer: number | undefined;
	private pendingUserDriven = false;

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
			const userDriven = update.transactions.some((transaction) =>
				transaction.isUserEvent('select')
			);
			this.schedule(userDriven);
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

	private schedule(userDriven?: boolean): void {
		if (userDriven !== undefined) {
			this.pendingUserDriven = userDriven;
		}
		if (this.timer !== undefined) {
			window.clearTimeout(this.timer);
		}
		this.timer = window.setTimeout(() => {
			this.timer = undefined;
			const selectionWasUserDriven = this.pendingUserDriven;
			this.pendingUserDriven = false;
			this.callback(selectionAnchorForView(this.view, selectionWasUserDriven));
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
