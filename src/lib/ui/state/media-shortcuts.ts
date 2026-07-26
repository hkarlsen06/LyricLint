import type { TransportAction } from './media-player.svelte.js';

/**
 * The transport triad, bound to the window rather than to the editor.
 *
 * It began as a CodeMirror keymap, which meant it only answered while the caret
 * was in the document — and the moment anything else had focus, a scrubber, a
 * severity chip, the draft's name, the tape could not be stopped. That is the
 * wrong half of the loop to serve. Transcribing is listen, pause, type, back up,
 * replay, and the pause is wanted most at exactly the moments the user has
 * stepped out of the text to deal with a finding.
 *
 * So there is one implementation and it lives here, and the editor no longer
 * knows these keys exist. Two implementations of one keystroke would double every
 * nudge the moment CodeMirror let the event bubble.
 */

/**
 * Physical keys, because the argument for J K L is physical: they are three keys
 * beside one another with pause in the middle, the shape every video editor uses.
 * `key` is the fallback for the environments — and the synthetic events — that
 * report a character but no `code`.
 */
const transportKeys: Readonly<Record<string, TransportAction>> = {
	KeyJ: 'back',
	KeyK: 'toggle',
	KeyL: 'forward'
};

/**
 * The action a keystroke asks for, or nothing.
 *
 * `Ctrl-Alt` and not the bare `Alt` the triad suggests. Everything simpler is
 * taken: `Mod-L` is the address bar, `Mod-Shift-J` and `Mod-Alt-J` open DevTools,
 * and `Ctrl-K` alone is CodeMirror's own delete-to-end-of-line on Mac. `Ctrl-Alt`
 * is AltGr on Windows, where J, K and L are unmapped on US and Nordic layouts.
 * Bare `Alt` is out for a reason that outlived the CodeMirror binding this
 * replaced: Option+J types a character on macOS, so the key never arrives as the
 * letter anything would match on.
 *
 * Shift and Meta are excluded rather than ignored — `Ctrl-Alt-Shift-K` is a
 * different keystroke, and a handler that answered to supersets of its own
 * binding would swallow one.
 */
export function matchTransportAction(event: KeyboardEvent): TransportAction | undefined {
	if (!event.ctrlKey || !event.altKey || event.metaKey || event.shiftKey) return undefined;
	const byCode = transportKeys[event.code];
	if (byCode) return byCode;
	return event.key.length === 1 ? transportKeys[`Key${event.key.toUpperCase()}`] : undefined;
}

export interface TransportShortcutOptions {
	/**
	 * Run the action, and say whether there was anything to run it on. False
	 * leaves the keystroke alone: a control that is not on screen must not eat a
	 * key press, which is the same rule the editor's own hook followed.
	 */
	transport: (action: TransportAction) => boolean;
	/** Injectable so a test can drive an element instead of the window. */
	target?: EventTarget;
}

/**
 * Listen for the triad anywhere in the window. Returns the teardown.
 *
 * The capture phase, so nothing between the press and here can swallow it first —
 * CodeMirror's own keymap runs on the content element and would otherwise have
 * the first word on a key it no longer binds.
 */
export function bindTransportShortcuts(options: TransportShortcutOptions): () => void {
	const target = options.target ?? window;

	function handle(event: Event): void {
		const keystroke = event as KeyboardEvent;
		const action = matchTransportAction(keystroke);
		if (action === undefined) return;

		// Held down, a nudge is a scrub and that is worth having. Held down, the
		// middle key would start and stop the track dozens of times a second and
		// come to rest wherever the last repeat happened to land, so it answers
		// once per press. Nothing is prevented on the way past: a repeat of a
		// modifier combination has no default worth taking.
		if (action === 'toggle' && keystroke.repeat) return;

		if (!options.transport(action)) return;
		keystroke.preventDefault();
	}

	target.addEventListener('keydown', handle, true);
	return () => target.removeEventListener('keydown', handle, true);
}
