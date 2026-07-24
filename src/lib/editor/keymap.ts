import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import type { KeyBinding } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import { parseDocument } from '../core/parser.js';
import type { Diagnostic, EditorCallbacks, TextRange } from '../core/types.js';
import type { LyricEditorCallbacks } from './contracts.js';
import { editorComposingField, editorContextField } from './extensions/editor-state.js';
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

function containingSectionRange(view: EditorView): TextRange {
	const position = view.state.selection.main.head;
	const text = view.state.doc.toString();
	const parsedContext = view.state.field(editorContextField)?.parsed;
	const parsed = parsedContext?.text === text ? parsedContext : parseDocument(text);
	const section = parsed.sections.find(
		(candidate) => candidate.from <= position && position <= candidate.to
	);
	if (!section) {
		const line = view.state.doc.lineAt(position);
		return { from: line.from, to: line.to };
	}
	const firstLine = view.state.doc.lineAt(section.from);
	return { from: section.from, to: firstLine.to };
}

/** Open the section picker for the parsed section containing the cursor. */
export function requestSectionHeader(view: EditorView, callbacks: EditorCallbacks): boolean {
	if (composing(view)) {
		return true;
	}
	callbacks.onSectionHeaderRequest({
		range: containingSectionRange(view),
		prefer: 'above'
	});
	return true;
}

function insertSection(callbacks: EditorCallbacks): (view: EditorView) => boolean {
	return (view) => requestSectionHeader(view, callbacks);
}

function activateDiagnostic(
	view: EditorView,
	callbacks: LyricEditorCallbacks,
	diagnostic: Diagnostic,
	intent: 'navigate' | 'fix'
): true {
	view.dispatch({
		selection: { anchor: diagnostic.from, head: diagnostic.to },
		scrollIntoView: true
	});
	if (callbacks.onDiagnosticActivateIntent) {
		callbacks.onDiagnosticActivateIntent(diagnostic, intent);
	} else {
		callbacks.onDiagnosticActivate(diagnostic);
	}
	return true;
}

function navigateDiagnostic(
	callbacks: LyricEditorCallbacks,
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
		return diagnostic ? activateDiagnostic(view, callbacks, diagnostic, 'navigate') : true;
	};
}

function openAvailableFix(callbacks: LyricEditorCallbacks): (view: EditorView) => boolean {
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
		return activateDiagnostic(view, callbacks, diagnostic, 'fix');
	};
}

function dismissDiagnostic(callbacks: LyricEditorCallbacks): () => boolean {
	return () => callbacks.onDiagnosticDismiss?.() ?? false;
}

/**
 * LyricLint commands precede standard CodeMirror editing/history bindings.
 * Callers may place explicit overrides first.
 */
export function lyricLintKeymap(
	callbacks: LyricEditorCallbacks,
	overrides: readonly KeyBinding[] = []
): KeyBinding[] {
	return [
		...overrides,
		{ key: 'Alt-p', run: assignPerformers(callbacks), preventDefault: true },
		{ key: 'Mod-Shift-h', run: insertSection(callbacks), preventDefault: true },
		{ key: 'F8', run: navigateDiagnostic(callbacks, 1), preventDefault: true },
		{ key: 'Shift-F8', run: navigateDiagnostic(callbacks, -1), preventDefault: true },
		{ key: 'Mod-.', run: openAvailableFix(callbacks), preventDefault: true },
		{ key: 'Escape', run: dismissDiagnostic(callbacks) },
		...defaultKeymap,
		...historyKeymap
	];
}
