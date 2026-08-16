import { describe, expect, it, vi } from 'vitest';
import type { TransportAction } from './media-player.svelte.js';
import {
	bindTransportShortcuts,
	matchEscapeAction,
	matchTransportAction,
	transportModifier
} from './media-shortcuts.js';

function keystroke(init: KeyboardEventInit): KeyboardEvent {
	return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
	const event = keystroke(init);
	target.dispatchEvent(event);
	return event;
}

describe('matchTransportAction', () => {
	it('maps the function row and media buttons without modifiers', () => {
		expect(matchTransportAction(keystroke({ key: 'F7' }))).toBe('back');
		expect(matchTransportAction(keystroke({ key: 'F8' }))).toBe('toggle');
		expect(matchTransportAction(keystroke({ key: 'F9' }))).toBe('forward');
		expect(matchTransportAction(keystroke({ key: 'MediaTrackPrevious' }))).toBe('back');
		expect(matchTransportAction(keystroke({ key: 'MediaPlayPause' }))).toBe('toggle');
		expect(matchTransportAction(keystroke({ key: 'MediaTrackNext' }))).toBe('forward');
		expect(matchTransportAction(keystroke({ key: 'F8', shiftKey: true }))).toBeUndefined();
	});

	it('reads the triad off the physical key, and off the character when there is no code', () => {
		expect(matchTransportAction(keystroke({ code: 'KeyJ', ctrlKey: true, altKey: true }))).toBe(
			'back'
		);
		expect(matchTransportAction(keystroke({ code: 'KeyK', ctrlKey: true, altKey: true }))).toBe(
			'toggle'
		);
		expect(matchTransportAction(keystroke({ code: 'KeyL', ctrlKey: true, altKey: true }))).toBe(
			'forward'
		);
		expect(matchTransportAction(keystroke({ key: 'k', ctrlKey: true, altKey: true }))).toBe(
			'toggle'
		);
	});

	it('uses Control on Mac and Alt elsewhere, with Ctrl+Alt as the universal fallback', () => {
		expect(matchTransportAction(keystroke({ code: 'KeyK', ctrlKey: true }), 'MacIntel')).toBe(
			'toggle'
		);
		expect(
			matchTransportAction(keystroke({ code: 'KeyK', altKey: true }), 'MacIntel')
		).toBeUndefined();
		expect(matchTransportAction(keystroke({ code: 'KeyK', altKey: true }), 'Win32')).toBe('toggle');
		expect(
			matchTransportAction(keystroke({ code: 'KeyK', ctrlKey: true }), 'Win32')
		).toBeUndefined();
		expect(
			matchTransportAction(keystroke({ code: 'KeyK', ctrlKey: true, altKey: true }), 'MacIntel')
		).toBe('toggle');
		expect(transportModifier('MacIntel')).toBe('Control');
		expect(transportModifier('Win32')).toBe('Alt');
	});

	/**
	 * AltGr is not a modifier this transport may read.
	 *
	 * Windows and X11 report AltGr as Control **and** Alt — which is the universal
	 * fallback's own combination — so on a layout where AltGr+L types a character,
	 * `ł` on a Polish keyboard, this listener claimed the keystroke and prevented
	 * it. In the capture phase, which means the letter could not be typed anywhere
	 * in the workbench for as long as audio was attached: not into the document,
	 * not into the draft's name. A modifier somebody is holding to write with is
	 * not one this may answer to.
	 */
	it('stands down for AltGr, which is reported as Ctrl+Alt', () => {
		const withAltGraph = (init: KeyboardEventInit) => {
			const event = keystroke(init);
			Object.defineProperty(event, 'getModifierState', {
				value: (name: string) => name === 'AltGraph'
			});
			return event;
		};

		for (const code of ['KeyJ', 'KeyK', 'KeyL']) {
			expect(
				matchTransportAction(withAltGraph({ code, ctrlKey: true, altKey: true }))
			).toBeUndefined();
		}
		// And the same chord without AltGr held is still the universal fallback.
		expect(matchTransportAction(keystroke({ code: 'KeyL', ctrlKey: true, altKey: true }))).toBe(
			'forward'
		);
	});

	// A handler that answered to supersets of its own binding would swallow a
	// keystroke somebody else had a use for.
	it('answers to no modifier superset', () => {
		expect(
			matchTransportAction(keystroke({ code: 'KeyK', ctrlKey: true, altKey: true, shiftKey: true }))
		).toBeUndefined();
		expect(
			matchTransportAction(keystroke({ code: 'KeyK', ctrlKey: true, altKey: true, metaKey: true }))
		).toBeUndefined();
		expect(
			matchTransportAction(keystroke({ code: 'KeyM', ctrlKey: true, altKey: true }))
		).toBeUndefined();
	});
});

describe('matchEscapeAction', () => {
	it('toggles bare, backs up on Shift, and goes forward on Alt', () => {
		expect(matchEscapeAction(keystroke({ key: 'Escape' }))).toBe('toggle');
		expect(matchEscapeAction(keystroke({ key: 'Escape', shiftKey: true }))).toBe('back');
		expect(matchEscapeAction(keystroke({ key: 'Escape', altKey: true }))).toBe('forward');
	});

	// Shift-and-Alt together is a superset of both bindings, so it answers to
	// neither — the same discipline the triad keeps.
	it('refuses Shift and Alt together, and the browser modifiers outright', () => {
		expect(
			matchEscapeAction(keystroke({ key: 'Escape', shiftKey: true, altKey: true }))
		).toBeUndefined();
		expect(matchEscapeAction(keystroke({ key: 'Escape', ctrlKey: true }))).toBeUndefined();
		expect(matchEscapeAction(keystroke({ key: 'Escape', metaKey: true }))).toBeUndefined();
		expect(matchEscapeAction(keystroke({ key: 'k' }))).toBeUndefined();
	});
});

describe('bare Space', () => {
	it('toggles from the page but never from a field or a control', () => {
		const page = document.createElement('div');
		const input = document.createElement('input');
		const button = document.createElement('button');
		const summary = document.createElement('summary');
		const editor = document.createElement('div');
		const syncingEditor = document.createElement('div');
		const syncingContent = document.createElement('div');
		editor.setAttribute('contenteditable', 'true');
		syncingEditor.className = 'cm-editor';
		syncingContent.setAttribute('contenteditable', 'false');
		syncingEditor.append(syncingContent);
		page.append(input, button, summary, editor, syncingEditor);

		expect(matchTransportAction(keystroke({ code: 'Space' }))).toBe('toggle');
		for (const owner of [input, button, summary, editor, syncingContent]) {
			const event = keystroke({ code: 'Space' });
			owner.dispatchEvent(event);
			expect(matchTransportAction(event)).toBeUndefined();
		}
	});

	it('leaves modified space alone', () => {
		expect(matchTransportAction(keystroke({ code: 'Space', shiftKey: true }))).toBeUndefined();
		expect(matchTransportAction(keystroke({ code: 'Space', ctrlKey: true }))).toBeUndefined();
	});
});

describe('bindTransportShortcuts', () => {
	// The whole point of moving this off the editor's keymap: the press lands
	// wherever the user is, not only where the caret is.
	it('answers from anywhere in the window, not only from the editor', () => {
		const target = document.createElement('div');
		const button = document.createElement('button');
		target.append(button);
		const actions: TransportAction[] = [];
		const stop = bindTransportShortcuts({
			target,
			transport: (action) => {
				actions.push(action);
				return true;
			}
		});

		const handled = press(button, { key: 'F8' });
		press(button, { key: 'F7' });
		press(target, { key: 'F9' });

		expect(actions).toEqual(['toggle', 'back', 'forward']);
		expect(handled.defaultPrevented).toBe(true);

		stop();
		press(button, { code: 'KeyK', ctrlKey: true, altKey: true });
		expect(actions).toEqual(['toggle', 'back', 'forward']);
	});

	it('connects and releases the operating system media controls', () => {
		const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
		const mediaSession = {
			setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
				handlers.set(action, handler);
			}
		};
		const transport = vi.fn(() => true);
		const play = vi.fn(() => true);
		const pause = vi.fn(() => true);

		const stop = bindTransportShortcuts({
			target: document.createElement('div'),
			mediaSession,
			transport,
			play,
			pause
		});

		handlers.get('previoustrack')?.({ action: 'previoustrack' });
		handlers.get('nexttrack')?.({ action: 'nexttrack' });
		handlers.get('play')?.({ action: 'play' });
		handlers.get('pause')?.({ action: 'pause' });

		expect(transport.mock.calls).toEqual([['back'], ['forward']]);
		expect(play).toHaveBeenCalledOnce();
		expect(pause).toHaveBeenCalledOnce();

		stop();
		expect([...handlers.values()].every((handler) => handler === null)).toBe(true);
	});

	// Nothing attached is nothing to control, and a control that is not on screen
	// must not eat a key press.
	it('leaves the keystroke alone when there is nothing to transport', () => {
		const target = document.createElement('div');
		const transport = vi.fn(() => false);
		bindTransportShortcuts({ target, transport });

		const event = press(target, { code: 'KeyK', ctrlKey: true, altKey: true });

		expect(transport).toHaveBeenCalledWith('toggle');
		expect(event.defaultPrevented).toBe(false);
	});

	// The bare-space toggle answers from the page at large, and a run is on the
	// page at large the moment the user aims the scrubber — the control a scoped
	// run's own design sends them to. While a run is under way the tap outranks
	// the toggle, and it claims the scrubber the toggle defers to; declined, the
	// space bar means exactly what it meant before.
	it('taps instead of toggling while a run is under way, the scrubber included', () => {
		const target = document.createElement('div');
		const scrubber = document.createElement('input');
		scrubber.type = 'range';
		target.append(scrubber);
		const actions: TransportAction[] = [];
		let running = false;
		let taps = 0;
		bindTransportShortcuts({
			target,
			transport: (action) => {
				actions.push(action);
				return true;
			},
			tap: () => {
				if (!running) return false;
				taps += 1;
				return true;
			}
		});

		// No run: the page-level space is the toggle, and the scrubber's own
		// space belongs to nobody.
		press(target, { code: 'Space' });
		press(scrubber, { code: 'Space' });
		expect(actions).toEqual(['toggle']);
		expect(taps).toBe(0);

		// A run claims both — the page, and the scrubber the toggle defers to.
		running = true;
		const fromPage = press(target, { code: 'Space' });
		const fromScrubber = press(scrubber, { code: 'Space' });
		expect(taps).toBe(2);
		expect(actions).toEqual(['toggle']);
		expect(fromPage.defaultPrevented).toBe(true);
		expect(fromScrubber.defaultPrevented).toBe(true);
	});

	// The two meanings the tap must not take away: a space that types, and a
	// space that presses. The draft's name is an input, a control activates, and
	// the editor's own keymap stays the only handler of a space landing in the
	// document — the run does not grow a second implementation of its own key.
	it('leaves spaces that type or press to their owners, run or no run', () => {
		const target = document.createElement('div');
		const name = document.createElement('input');
		const button = document.createElement('button');
		const editor = document.createElement('div');
		editor.setAttribute('contenteditable', 'true');
		target.append(name, button, editor);
		const tap = vi.fn(() => true);
		bindTransportShortcuts({ target, transport: () => true, tap });

		press(name, { code: 'Space' });
		press(button, { code: 'Space' });
		press(editor, { code: 'Space' });

		expect(tap).not.toHaveBeenCalled();
	});

	// Held down, a repeating space would machine-gun anchors down the document —
	// the same reason the toggle answers once per press.
	it('does not repeat a held tap', () => {
		const target = document.createElement('div');
		const tap = vi.fn(() => true);
		bindTransportShortcuts({ target, transport: () => true, tap });

		press(target, { code: 'Space' });
		press(target, { code: 'Space', repeat: true });

		expect(tap).toHaveBeenCalledOnce();
	});

	// The reach-for keys: Escape toggles, Shift+Escape backs up, Alt+Escape goes
	// forward, from anywhere nothing else has claimed the press.
	it('toggles, backs up, and goes forward on the Escape family from the page', () => {
		const target = document.createElement('div');
		const actions: TransportAction[] = [];
		bindTransportShortcuts({
			target,
			transport: (action) => {
				actions.push(action);
				return true;
			}
		});

		const toggled = press(target, { key: 'Escape' });
		const backed = press(target, { key: 'Escape', shiftKey: true });
		const forwarded = press(target, { key: 'Escape', altKey: true });

		expect(actions).toEqual(['toggle', 'back', 'forward']);
		expect(toggled.defaultPrevented).toBe(true);
		expect(backed.defaultPrevented).toBe(true);
		expect(forwarded.defaultPrevented).toBe(true);
	});

	// The tape is remembered but not attached yet, so a bare Escape loads it —
	// the same press the strip's `Load …` control makes. Only the bare toggle
	// does; the nudges have nothing to step through until something is loaded.
	it('loads a pending source on a bare Escape when nothing is playing', () => {
		const target = document.createElement('div');
		const load = vi.fn(() => true);
		bindTransportShortcuts({ target, transport: () => false, load });

		const loaded = press(target, { key: 'Escape' });
		press(target, { key: 'Escape', shiftKey: true });
		press(target, { key: 'Escape', altKey: true });

		expect(load).toHaveBeenCalledTimes(1);
		expect(loaded.defaultPrevented).toBe(true);
	});

	// A press that plays takes precedence: load is the fallback for when there was
	// nothing to play, so it never runs while a track is attached.
	it('does not load when a press already drove the transport', () => {
		const target = document.createElement('div');
		const load = vi.fn(() => true);
		bindTransportShortcuts({ target, transport: () => true, load });

		press(target, { key: 'Escape' });

		expect(load).not.toHaveBeenCalled();
	});

	// Nothing playing and nothing to load: the Escape is left to mean whatever
	// else it might, exactly as an unclaimed nudge is.
	it('leaves the Escape alone when there is nothing to play or load', () => {
		const target = document.createElement('div');
		const load = vi.fn(() => false);
		bindTransportShortcuts({ target, transport: () => false, load });

		const event = press(target, { key: 'Escape' });

		expect(load).toHaveBeenCalledOnce();
		expect(event.defaultPrevented).toBe(false);
	});

	// Every other Escape in the workbench means "close the surface on top", and
	// each claims the event before it reaches the window. A press already
	// prevented is a press this leaves entirely alone.
	it('defers to a surface that already prevented the Escape', () => {
		const target = document.createElement('div');
		const surface = document.createElement('div');
		target.append(surface);
		// A surface-level handler runs first in the bubble phase and claims it.
		surface.addEventListener('keydown', (event) => event.preventDefault());
		const transport = vi.fn(() => true);
		bindTransportShortcuts({ target, transport });

		press(surface, { key: 'Escape' });

		expect(transport).not.toHaveBeenCalled();
	});

	// A native <dialog> closes on Escape without reliably marking the keydown, so
	// deferral there is read off the target rather than the prevented flag.
	it('defers to an open modal by its target', () => {
		const target = document.createElement('div');
		const dialog = document.createElement('dialog');
		const field = document.createElement('input');
		dialog.append(field);
		target.append(dialog);
		const transport = vi.fn(() => true);
		bindTransportShortcuts({ target, transport });

		press(field, { key: 'Escape' });

		expect(transport).not.toHaveBeenCalled();
	});

	// Held down, the pause would start and stop the track dozens of times a
	// second; a held nudge is a scrub worth having, exactly as the triad splits.
	it('does not repeat the Escape pause but repeats the nudges', () => {
		const target = document.createElement('div');
		const actions: TransportAction[] = [];
		bindTransportShortcuts({
			target,
			transport: (action) => {
				actions.push(action);
				return true;
			}
		});

		press(target, { key: 'Escape' });
		press(target, { key: 'Escape', repeat: true });
		press(target, { key: 'Escape', shiftKey: true });
		press(target, { key: 'Escape', shiftKey: true, repeat: true });
		press(target, { key: 'Escape', altKey: true });
		press(target, { key: 'Escape', altKey: true, repeat: true });

		expect(actions).toEqual(['toggle', 'back', 'back', 'forward', 'forward']);
	});

	// Nothing attached is nothing to control, so an unclaimed Escape is left to
	// mean whatever else it might — the transport does not eat it.
	it('leaves the Escape alone when there is nothing to transport', () => {
		const target = document.createElement('div');
		const transport = vi.fn(() => false);
		bindTransportShortcuts({ target, transport });

		const event = press(target, { key: 'Escape' });

		expect(transport).toHaveBeenCalledWith('toggle');
		expect(event.defaultPrevented).toBe(false);
	});

	// Held down, a nudge is a scrub worth having; held down, play/pause would start
	// and stop the track dozens of times and settle wherever the last repeat landed.
	it('repeats a nudge and does not repeat the pause', () => {
		const target = document.createElement('div');
		const actions: TransportAction[] = [];
		bindTransportShortcuts({
			target,
			transport: (action) => {
				actions.push(action);
				return true;
			}
		});

		press(target, { code: 'KeyJ', ctrlKey: true, altKey: true });
		press(target, { code: 'KeyJ', ctrlKey: true, altKey: true, repeat: true });
		press(target, { code: 'KeyK', ctrlKey: true, altKey: true });
		press(target, { code: 'KeyK', ctrlKey: true, altKey: true, repeat: true });

		expect(actions).toEqual(['back', 'back', 'toggle']);
	});

	/**
	 * A held space pauses once and scrolls never.
	 *
	 * The repeat is dropped, which is right — but the repeats of a *bare space*
	 * still carry their default, and that default is the page scrolling. So the
	 * first press paused the tape and every repeat after it ran the document out
	 * from under the reader who was still holding the key. The press that could
	 * ask `transport` is what records the answer, because a repeat asking would be
	 * a repeat running the action.
	 */
	it('keeps a held space from scrolling the page it just paused', () => {
		const target = document.createElement('div');
		const transport = vi.fn(() => true);
		bindTransportShortcuts({ target, transport });

		const first = press(target, { code: 'Space' });
		const held = press(target, { code: 'Space', repeat: true });

		expect(transport).toHaveBeenCalledOnce();
		expect(first.defaultPrevented).toBe(true);
		expect(held.defaultPrevented).toBe(true);
	});

	// And a control that is not on screen must not eat a key press, held or not:
	// nothing answered the first press, so the repeats are the page's own.
	it('leaves a held space alone when there is nothing to transport', () => {
		const target = document.createElement('div');
		bindTransportShortcuts({ target, transport: () => false });

		const first = press(target, { code: 'Space' });
		const held = press(target, { code: 'Space', repeat: true });

		expect(first.defaultPrevented).toBe(false);
		expect(held.defaultPrevented).toBe(false);
	});
});
