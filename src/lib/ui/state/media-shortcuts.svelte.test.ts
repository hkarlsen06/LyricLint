import { describe, expect, it, vi } from 'vitest';
import type { TransportAction } from './media-player.svelte.js';
import {
	bindTransportShortcuts,
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
});
