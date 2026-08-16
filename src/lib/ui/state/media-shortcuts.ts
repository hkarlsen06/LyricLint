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
	// AltGr is reported as Control **and** Alt on Windows and X11, which is the
	// universal fallback's own combination — so on a layout where AltGr+L types a
	// character (Polish `ł`), claiming it here would make that letter untypeable
	// anywhere in the workbench for as long as audio is attached, because this
	// listener is in the capture phase and prevents what it answers. A modifier
	// the user is holding to write with is not a modifier this transport may read.
	if (event.getModifierState?.('AltGraph')) return undefined;
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
 * The Escape family drives the transport, and it is the cluster a transcriber
 * can actually reach for in the heat of the moment. Escape is the keyboard's one
 * large key that can never write a character into the document, and neither can
 * it while a modifier is held — so a fumbled press costs nothing, where a fumbled
 * `Alt-J` lands a letter in somebody's lyric that they now have to find and
 * erase, at exactly the moment they had no attention to spare. Bare Escape
 * toggles, Shift+Escape backs up, and Alt+Escape (Option+Escape) goes forward:
 * one key under the pinky and a modifier under the other fingers or the thumb, so
 * the whole triad is a shape the hand holds without leaving Escape. A mistimed
 * modifier degrades to a bare Escape, which merely pauses.
 *
 * Shift-and-Alt together is refused rather than answered, the same no-superset
 * discipline `matchTransportAction` keeps: a handler that answered to a superset
 * of its own binding would swallow a keystroke somebody else had a use for.
 *
 * The family is the bottom of the Escape stack, never the top. Every other Escape
 * in the workbench means "close the surface on top" — dismiss a popover, cancel
 * a find, end a sync run, reset the draft's name — and each of those claims the
 * event by preventing its default or stopping its propagation. So the binding
 * reads `defaultPrevented` and stands down, and it stands down for an open modal
 * by the press's target rather than by the flag, because a native `<dialog>`
 * closes on Escape without reliably marking the keydown. What is left — an
 * Escape with nothing above it to close — is the case this exists for: the caret
 * is just sitting in the document, and the tape needs to stop.
 */
export function matchEscapeAction(event: KeyboardEvent): TransportAction | undefined {
	if (event.key !== 'Escape') return undefined;
	if (event.ctrlKey || event.metaKey) return undefined;
	if (event.shiftKey && event.altKey) return undefined;
	if (event.altKey) return 'forward';
	if (event.shiftKey) return 'back';
	return 'toggle';
}

/**
 * Whether the press landed inside a modal that owns Escape for its own close.
 * A native `<dialog>` and a Bits UI dialog (`role="dialog"`) both close on
 * Escape, and the first does it without setting `defaultPrevented` — so this is
 * read off the target, which is trapped inside the open dialog either way.
 */
function targetInDialog(target: EventTarget | null): boolean {
	return target instanceof Element && target.closest('dialog, [role="dialog"]') !== null;
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
	/**
	 * Load a source that is remembered but not yet attached, and say whether there
	 * was one to load. A bare Escape spends this when nothing is playing: the tape
	 * is not here yet, so the reach-for key brings it — the same press the strip's
	 * `Load …` / `Reconnect …` control makes. False leaves the keystroke alone.
	 */
	load?: () => boolean;
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

	// Whether the space bar now down is one this listener answered. A repeat can
	// no longer ask — the question is `transport`, and asking it would run the
	// action — so the press that could ask is what records the answer.
	let claimedSpace = false;

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
			claimedSpace = true;
			keystroke.preventDefault();
			keystroke.stopPropagation();
			return;
		}

		const action = matchTransportAction(keystroke);
		if (action === undefined) return;

		// Held down, a nudge is a scrub and that is worth having. Held down, the
		// middle key would start and stop the track dozens of times a second and
		// come to rest wherever the last repeat happened to land, so it answers
		// once per press. A repeat of a modifier combination has no default worth
		// taking — but a bare space does, and it is the page scrolling: the first
		// press pauses the tape, and every repeat after it would run the document
		// out from under the reader still holding the key. Only a space this
		// listener actually claimed is held on to, or a held space with nothing
		// attached would be eaten by a control that is not on screen.
		if (action === 'toggle' && keystroke.repeat) {
			if (claimedSpace && isBareSpace(keystroke)) keystroke.preventDefault();
			return;
		}

		if (!options.transport(action)) {
			if (isBareSpace(keystroke)) claimedSpace = false;
			return;
		}
		if (isBareSpace(keystroke)) claimedSpace = true;
		keystroke.preventDefault();
		keystroke.stopPropagation();
	}

	// The key coming up ends whatever the press claimed, so a later held space
	// over a detached source cannot inherit an answer from the last attached one.
	function release(event: Event): void {
		const keystroke = event as KeyboardEvent;
		if (keystroke.code === 'Space' || keystroke.key === ' ') claimedSpace = false;
	}

	// Escape and Shift+Escape are the reach-for keys, and unlike the triad they
	// defer to everything: this listener is in the bubble phase, so every
	// surface-level Escape handler in the window has already run and either
	// prevented the default or stopped the event before it arrives here. What
	// reaches this is an Escape nobody else wanted — the caret sitting in the
	// document — which is precisely the press that means "stop the tape".
	function handleEscape(event: Event): void {
		const keystroke = event as KeyboardEvent;
		// Something above claimed it — a popover, a find bar, a sync run, the draft
		// title's own reset — so leave the keystroke alone.
		if (keystroke.defaultPrevented) return;
		const action = matchEscapeAction(keystroke);
		if (action === undefined) return;
		// A modal owns Escape for its own close, and a native dialog does it
		// without marking the event; read that off the target, not the flag.
		if (targetInDialog(keystroke.target)) return;
		// Held down, a back is a scrub worth having; held down, the pause would
		// start and stop the track dozens of times a second, exactly as the
		// triad's toggle would.
		if (action === 'toggle' && keystroke.repeat) return;
		if (options.transport(action)) {
			keystroke.preventDefault();
			keystroke.stopPropagation();
			return;
		}
		// Nothing playing took the press. A bare Escape then loads a source that is
		// remembered but waiting on a gesture — the tape is not here yet, and the
		// reach-for key is what brings it. The nudges have no such fallback: there
		// is nothing to step through until something is loaded.
		if (action === 'toggle' && options.load?.()) {
			keystroke.preventDefault();
			keystroke.stopPropagation();
		}
	}

	target.addEventListener('keydown', handle, true);
	target.addEventListener('keydown', handleEscape, false);
	target.addEventListener('keyup', release, true);

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
		target.removeEventListener('keydown', handleEscape, false);
		target.removeEventListener('keyup', release, true);
		for (const action of registeredActions) {
			try {
				mediaSession?.setActionHandler(action, null);
			} catch {
				// The corresponding registration already proved this path optional.
			}
		}
	};
}
