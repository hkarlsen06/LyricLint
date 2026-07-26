import { describe, expect, it, vi } from 'vitest';
import type { TransportAction } from './media-player.svelte.js';
import { bindTransportShortcuts, matchTransportAction } from './media-shortcuts.js';

function keystroke(init: KeyboardEventInit): KeyboardEvent {
	return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
	const event = keystroke(init);
	target.dispatchEvent(event);
	return event;
}

describe('matchTransportAction', () => {
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

	// A handler that answered to supersets of its own binding would swallow a
	// keystroke somebody else had a use for.
	it('answers to Ctrl+Alt alone and to no superset of it', () => {
		expect(matchTransportAction(keystroke({ code: 'KeyK', ctrlKey: true }))).toBeUndefined();
		expect(matchTransportAction(keystroke({ code: 'KeyK', altKey: true }))).toBeUndefined();
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

		const handled = press(button, { code: 'KeyK', ctrlKey: true, altKey: true });
		press(button, { code: 'KeyJ', ctrlKey: true, altKey: true });
		press(target, { code: 'KeyL', ctrlKey: true, altKey: true });

		expect(actions).toEqual(['toggle', 'back', 'forward']);
		expect(handled.defaultPrevented).toBe(true);

		stop();
		press(button, { code: 'KeyK', ctrlKey: true, altKey: true });
		expect(actions).toEqual(['toggle', 'back', 'forward']);
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
