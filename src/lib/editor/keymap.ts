import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import type { KeyBinding } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { Diagnostic, EditorCallbacks, TextRange } from '$lib/core/types.js';
import { canAssignVoiceGroup } from '$lib/performers/transform.js';
import type { LyricEditorCallbacks } from './contracts.js';
import { linkTargetAt } from './section-links.js';
import {
	editorComposingField,
	editorContextField,
	parsedDocumentForView
} from './extensions/editor-state.js';
import { anchorLineEffect, anchorTimeAt, formatAnchorTime } from './extensions/line-anchors.js';
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
		// The same question the picker asks itself before opening on a pointer
		// selection, so the two ways in cannot disagree about what is assignable.
		// This one says so out loud: the press was aimed at this command, and a
		// shortcut that silently does nothing reads as a shortcut that is broken.
		if (!canAssignVoiceGroup(parsedDocumentForView(view), { anchor: range.from, head: range.to })) {
			return announce(
				callbacks,
				'Performers are assigned to lyric lines within one section that has a header.'
			);
		}
		callbacks.onAssignRequest({ range, prefer: 'above' });
		return true;
	};
}

/**
 * Open the link picker on the repeated section the caret is in.
 *
 * The pointer opens this card by selecting a header whole, which a keyboard
 * user has no equivalent of — every anchored surface here is `aria-hidden`
 * inside CodeMirror's gutters or reached by a drag. So the shortcut asks the
 * same question of the same predicate, and answers a refusal out loud: an aimed
 * press that silently does nothing reads as a broken shortcut.
 */
export function requestSectionLink(view: EditorView, callbacks: LyricEditorCallbacks): boolean {
	if (composing(view)) {
		return true;
	}
	const range = logicalSelection(view);
	const target = linkTargetAt(
		parsedDocumentForView(view),
		view.state.field(editorContextField, false)?.languagePack,
		range.from,
		range.to
	);
	if (!target) {
		return announce(
			callbacks,
			'Put the cursor in a chorus, pre-chorus, or post-chorus to link it to the others, or select the words that differ.'
		);
	}
	callbacks.onSectionLinkRequest?.({
		range: target.header,
		prefer: 'above',
		selection: target.selection
	});
	return true;
}

function linkSections(callbacks: LyricEditorCallbacks): (view: EditorView) => boolean {
	return (view) => requestSectionLink(view, callbacks);
}

function containingSectionRange(view: EditorView): TextRange {
	const position = view.state.selection.main.head;
	const section = parsedDocumentForView(view).sections.find(
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
 * Anchor this line to where the audio is now, replacing whatever was there.
 *
 * The keyboard's way to time a single line, and the way to correct one sync mode
 * got wrong without starting another run over the whole song.
 */
function anchorCurrentLine(callbacks: LyricEditorCallbacks): (view: EditorView) => boolean {
	return (view) => {
		if (composing(view)) return true;
		const time = callbacks.onRequestMediaTime?.();
		if (time === undefined || !Number.isFinite(time)) {
			return announce(callbacks, 'Attach audio before anchoring a line to it.');
		}
		view.dispatch({
			effects: anchorLineEffect.of({ pos: view.state.selection.main.head, time })
		});
		return announce(callbacks, `Line anchored at ${formatAnchorTime(time)}.`);
	};
}

/**
 * Play from this line's anchor.
 *
 * Nothing about the document moves — not the caret, not the scroll position.
 * The only thing that happens is that the audio goes somewhere.
 */
function playFromCurrentLine(callbacks: LyricEditorCallbacks): (view: EditorView) => boolean {
	return (view) => {
		if (composing(view)) return true;
		const time = anchorTimeAt(view.state, view.state.selection.main.head);
		if (time === undefined) {
			return announce(callbacks, 'This line has no audio anchor.');
		}
		callbacks.onSeekMedia?.(time);
		return announce(callbacks, `Playing from ${formatAnchorTime(time)}.`);
	};
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
		// `Alt-p` has never fired on macOS. Option+P types a character there, so
		// CodeMirror's dispatcher refuses the base-key fallback for Alt held without
		// Ctrl or Cmd and nothing matches — the same trap the transport below
		// documents at length, and `Ctrl-Alt` is the same answer to it: the one
		// modifier span free on both platforms. The old key stays as the alias
		// Windows and Linux have been pressing all along.
		{ key: 'Ctrl-Alt-p', run: assignPerformers(callbacks), preventDefault: true },
		{ key: 'Alt-p', run: assignPerformers(callbacks), preventDefault: true },
		{ key: 'Mod-Shift-h', run: insertSection(callbacks), preventDefault: true },
		// `Mod-Shift` and deliberately not the `Ctrl-Alt` family the rest of these
		// live in: `Ctrl-Alt-L` is the transport's forward key, bound to the window,
		// and two implementations of one keystroke is how every nudge came to fire
		// twice. This belongs beside `Mod-Shift-H` anyway — both are commands about
		// the song's structure rather than about its audio.
		{ key: 'Mod-Shift-l', run: linkSections(callbacks), preventDefault: true },
		// F7 through F9 belong to the transport. F2 and Shift-F2 keep diagnostic
		// navigation on the function row without asking one key to mean two things.
		// `.` and `,` remain the cross-platform primaries because they are adjacent
		// on US and Nordic layouts and `.` already means "diagnostic" through
		// `Mod-.` below.
		{ key: 'Ctrl-Alt-.', run: navigateDiagnostic(callbacks, 1), preventDefault: true },
		{ key: 'Ctrl-Alt-,', run: navigateDiagnostic(callbacks, -1), preventDefault: true },
		{ key: 'F2', run: navigateDiagnostic(callbacks, 1), preventDefault: true },
		{ key: 'Shift-F2', run: navigateDiagnostic(callbacks, -1), preventDefault: true },
		{ key: 'Mod-.', run: openAvailableFix(callbacks), preventDefault: true },
		// The transport triad — `Ctrl-Alt-J`, `K`, `L` — is deliberately *not* here.
		// It is bound to the window in `ui/state/media-shortcuts.ts`, because the
		// tape is most wanted when the caret has left the document. Binding it in
		// both places would double every nudge.
		//
		// The two anchor commands stay, in the same Ctrl-Alt family because they are
		// pressed in the same breath as the transport, and here because each needs
		// the caret's own line. `M` marks; `Enter` goes.
		{ key: 'Ctrl-Alt-m', run: anchorCurrentLine(callbacks), preventDefault: true },
		{ key: 'Ctrl-Alt-Enter', run: playFromCurrentLine(callbacks), preventDefault: true },
		{ key: 'Escape', run: dismissDiagnostic(callbacks) },
		...defaultKeymap,
		...historyKeymap
	];
}
