import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import type { KeyBinding } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { Diagnostic, EditorCallbacks, TextRange } from '../core/types.js';
import { editorComposingField } from './extensions/editor-state.js';
import { diagnosticsForState, sortDiagnostics } from './extensions/lint-decorations.js';

function logicalSelection(view: EditorView): TextRange {
	const selection = view.state.selection.main;
	return {
		from: Math.min(selection.anchor, selection.head),
		to: Math.max(selection.anchor, selection.head)
	};
}

function composing(view: EditorView): boolean {
	return view.composing || view.state.field(editorComposingField);
}

function announce(callbacks: EditorCallbacks, message: string): true {
	callbacks.onAnnouncement(message);
	return true;
}

function assignPerformers(callbacks: EditorCallbacks): (view: EditorView) => boolean {
	return (view) => {
		if (composing(view)) {
			return true;
		}
		const range = logicalSelection(view);
		if (range.from === range.to || view.state.doc.sliceString(range.from, range.to).trim() === '') {
			return announce(callbacks, 'Select lyric text before assigning performers.');
		}
		callbacks.onAssignRequest({ range, prefer: 'above' });
		return true;
	};
}

function insertSection(callbacks: EditorCallbacks): (view: EditorView) => boolean {
	return (view) => {
		if (composing(view)) {
			return true;
		}
		const line = view.state.doc.lineAt(view.state.selection.main.head);
		callbacks.onSectionHeaderRequest({
			range: { from: line.from, to: line.to },
			prefer: 'above'
		});
		return true;
	};
}

function activateDiagnostic(
	view: EditorView,
	callbacks: EditorCallbacks,
	diagnostic: Diagnostic
): true {
	view.dispatch({
		selection: { anchor: diagnostic.from, head: diagnostic.to },
		scrollIntoView: true
	});
	callbacks.onDiagnosticActivate(diagnostic);
	return true;
}

function navigateDiagnostic(
	callbacks: EditorCallbacks,
	direction: 1 | -1
): (view: EditorView) => boolean {
	return (view) => {
		if (composing(view)) {
			return true;
		}
		const diagnostics = [...diagnosticsForState(view.state)].sort(
			(left, right) => left.from - right.from || left.to - right.to
		);
		if (diagnostics.length === 0) {
			return announce(callbacks, 'No diagnostics.');
		}

		const position = view.state.selection.main.head;
		const diagnostic =
			direction === 1
				? (diagnostics.find((candidate) => candidate.from > position) ?? diagnostics[0])
				: ([...diagnostics].reverse().find((candidate) => candidate.to < position) ??
					diagnostics.at(-1));
		return diagnostic ? activateDiagnostic(view, callbacks, diagnostic) : true;
	};
}

function openAvailableFix(callbacks: EditorCallbacks): (view: EditorView) => boolean {
	return (view) => {
		if (composing(view)) {
			return true;
		}
		const position = view.state.selection.main.head;
		const diagnostics = sortDiagnostics(
			diagnosticsForState(view.state).filter(
				(diagnostic) => diagnostic.fixes && diagnostic.fixes.length > 0
			)
		);
		const diagnostic =
			diagnostics.find((candidate) => candidate.from <= position && candidate.to >= position) ??
			diagnostics[0];
		if (!diagnostic) {
			return announce(callbacks, 'No fixes are available at the current position.');
		}
		return activateDiagnostic(view, callbacks, diagnostic);
	};
}

/**
 * LyricLint commands precede standard CodeMirror editing/history bindings.
 * Callers may place explicit overrides first.
 */
export function lyricLintKeymap(
	callbacks: EditorCallbacks,
	overrides: readonly KeyBinding[] = []
): KeyBinding[] {
	return [
		...overrides,
		{ key: 'Alt-p', run: assignPerformers(callbacks), preventDefault: true },
		{ key: 'Mod-Shift-h', run: insertSection(callbacks), preventDefault: true },
		{ key: 'F8', run: navigateDiagnostic(callbacks, 1), preventDefault: true },
		{ key: 'Shift-F8', run: navigateDiagnostic(callbacks, -1), preventDefault: true },
		{ key: 'Mod-.', run: openAvailableFix(callbacks), preventDefault: true },
		...defaultKeymap,
		...historyKeymap
	];
}
