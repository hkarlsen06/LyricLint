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

const directTransportKeys: Readonly<Record<string, TransportAction>> = {
	F7: 'back',
	F8: 'toggle',
	F9: 'forward',
	MediaTrackPrevious: 'back',
	MediaPlayPause: 'toggle',
	MediaTrackNext: 'forward'
};

function currentPlatform(): string {
	return typeof navigator === 'undefined' ? '' : navigator.platform;
}

export function transportModifier(platform = currentPlatform()): 'Control' | 'Alt' {
	return /Mac|iPhone|iPad|iPod/i.test(platform) ? 'Control' : 'Alt';
}

/**
 * The action a keystroke asks for, or nothing.
 *
 * The one-modifier fallback follows the platform: Control on macOS, where Option
 * types characters, and Alt on Windows and Linux, where Control-J/K/L belong to
 * the browser. Ctrl-Alt remains the universal fallback.
 *
 * Shift and Meta are excluded rather than ignored — `Ctrl-Alt-Shift-K` is a
 * different keystroke, and a handler that answered to supersets of its own
 * binding would swallow one.
 */
export function matchTransportAction(
	event: KeyboardEvent,
	platform = currentPlatform()
): TransportAction | undefined {
	// The function row and actual media keys need no modifier. Bare Space also
	// toggles, but only when the press was not aimed at something that owns it.
	if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
		const direct = directTransportKeys[event.code] ?? directTransportKeys[event.key];
		if (direct) return direct;
		if (event.code !== 'Space' && event.key !== ' ') return undefined;
		return ownsSpace(event.target) ? undefined : 'toggle';
	}
	if (event.metaKey || event.shiftKey) return undefined;
	const primary =
		transportModifier(platform) === 'Control'
			? event.ctrlKey && !event.altKey
			: event.altKey && !event.ctrlKey;
	const universal = event.ctrlKey && event.altKey;
	if (!primary && !universal) return undefined;
	const byCode = transportKeys[event.code];
	if (byCode) return byCode;
	return event.key.length === 1 ? transportKeys[`Key${event.key.toUpperCase()}`] : undefined;
}

/**
 * Whether this element owns the space bar already: a field being typed into (the
 * lyric editor is `contenteditable`, the draft name and performer names are
 * inputs), or a control a space would press.
 */
function ownsSpace(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	return (
		target.closest(
			"input, textarea, select, button, summary, a[href], [role='button'], [contenteditable='true'], .cm-editor"
		) !== null
	);
}

/** A bare space: the key with nothing held, however the event spells it. */
function isBareSpace(event: KeyboardEvent): boolean {
	if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
	return event.code === 'Space' || event.key === ' ';
}

/**
 * Whether a space on this element types a character or presses a control —
 * the two meanings a run's tap must not take away.
 *
 * Deliberately narrower than `ownsSpace`. The toggle defers to every input,
 * the scrubber included, because pausing from a slider nobody is typing into
 * is merely unnecessary. The tap cannot afford that deference: the scrubber is
 * exactly where a run's own design just sent the user to park the tape, and a
 * tap that went dead the moment they aimed it is the mode refusing its one
 * gesture at the one moment it is needed. A range input neither types nor
 * presses on space, so the tap claims it; a text field and every real control
 * keep theirs. The editor stays exempt through `contenteditable`, so the run's
 * own keymap remains the only handler of a space landing in the document.
 */
function spaceTypesOrPresses(target: EventTarget | null): boolean {
	if (!(target instanceof Element)) return false;
	if (
		target.closest(
			"textarea, select, button, summary, a[href], [role='button'], [contenteditable='true']"
		) !== null
	) {
		return true;
	}
	const input = target.closest('input');
	return input !== null && input.type !== 'range';
}

type MediaSessionControls = Pick<MediaSession, 'setActionHandler'>;

export interface TransportShortcutOptions {
	/**
	 * Run the action, and say whether there was anything to run it on. False
	 * leaves the keystroke alone: a control that is not on screen must not eat a
	 * key press, which is the same rule the editor's own hook followed.
	 */
	transport: (action: TransportAction) => boolean;
	/**
	 * Time a line, and say whether a run was under way to time it in. While one
	 * is, a bare space is the tap wherever it lands — the run's one gesture
	 * outranks the toggle, and it claims the scrubber the toggle defers to.
	 * False leaves the keystroke to the toggle, exactly as before.
	 */
	tap?: () => boolean;
	/** Exact play and pause operations for the OS media-session buttons. */
	play?: () => boolean;
	pause?: () => boolean;
	/** Injectable so a test can drive an element instead of the window. */
	target?: EventTarget;
	/** Injectable for tests; null deliberately disables native media controls. */
	mediaSession?: MediaSessionControls | null;
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
	const mediaSession =
		options.mediaSession === null
			? undefined
			: (options.mediaSession ??
				(typeof navigator === 'undefined' ? undefined : navigator.mediaSession));

	function handle(event: Event): void {
		const keystroke = event as KeyboardEvent;

		// A run's tap comes first, or the toggle underneath pauses the tape out
		// from under it: the bare-space toggle answers from the page at large, and
		// a run is on the page at large the moment the user aims the scrubber.
		// A held space must not machine-gun anchors down the document, so a
		// repeat is dropped exactly as the toggle drops one.
		if (
			isBareSpace(keystroke) &&
			!keystroke.repeat &&
			!spaceTypesOrPresses(keystroke.target) &&
			options.tap?.()
		) {
			keystroke.preventDefault();
			keystroke.stopPropagation();
			return;
		}

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
		keystroke.stopPropagation();
	}

	target.addEventListener('keydown', handle, true);

	const registeredActions: MediaSessionAction[] = [];
	const mediaActions: Array<[MediaSessionAction, () => void]> = [
		['previoustrack', () => void options.transport('back')],
		['seekbackward', () => void options.transport('back')],
		['nexttrack', () => void options.transport('forward')],
		['seekforward', () => void options.transport('forward')]
	];
	if (options.play) mediaActions.push(['play', () => void options.play?.()]);
	if (options.pause) mediaActions.push(['pause', () => void options.pause?.()]);

	for (const [action, run] of mediaActions) {
		try {
			mediaSession?.setActionHandler(action, run);
			if (mediaSession) registeredActions.push(action);
		} catch {
			// Browsers may expose Media Session without supporting every action.
		}
	}

	return () => {
		target.removeEventListener('keydown', handle, true);
		for (const action of registeredActions) {
			try {
				mediaSession?.setActionHandler(action, null);
			} catch {
				// The corresponding registration already proved this path optional.
			}
		}
	};
}
