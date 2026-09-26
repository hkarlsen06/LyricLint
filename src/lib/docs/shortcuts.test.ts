import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { keymap, type KeyBinding } from '@codemirror/view';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { lyricLintKeymap } from '$lib/editor/keymap.js';
import type { LyricEditorCallbacks } from '$lib/editor/contracts.js';
import { lyricSync } from '$lib/editor/extensions/lyric-sync.js';
import {
	matchEscapeAction,
	matchTransportAction,
	type TransportKeyEvent
} from '$lib/ui/state/media-shortcuts.js';
import { shortcuts } from './shortcuts.js';

/** `Ctrl-Alt-J` and `alt-ctrl-j` are one keystroke: modifiers sorted, case folded. */
function normalize(combo: string): string {
	const parts = combo.toLowerCase().split('-');
	const key = parts.pop();
	return [...parts.sort(), key].join('-');
}

const documented = new Set(
	Object.values(shortcuts).flatMap((section) =>
		section.flatMap((shortcut) => shortcut.combos.map(normalize))
	)
);

function keysOf(bindings: readonly KeyBinding[]): string[] {
	const standard = new Set<KeyBinding>([...defaultKeymap, ...historyKeymap]);
	return bindings
		.filter((binding) => !standard.has(binding))
		.flatMap((binding) => [binding.key, binding.mac, binding.win, binding.linux])
		.filter((key): key is string => key !== undefined);
}

function editorKeys(): string[] {
	return keysOf(lyricLintKeymap({} as LyricEditorCallbacks));
}

function syncKeys(): string[] {
	// SAFETY: the options are only captured by the commands, never called while
	// building the extension, which is all this reads.
	const state = EditorState.create({ extensions: lyricSync({} as Parameters<typeof lyricSync>[0]) });
	return keysOf(state.facet(keymap).flat());
}

/**
 * The window transport binds by physical key, so ask its matchers about every
 * plausible keystroke on both platforms and keep the ones they answer.
 */
function transportKeys(): string[] {
	const letters = [...'abcdefghijklmnopqrstuvwxyz'].map((letter) => ({
		code: `Key${letter.toUpperCase()}`,
		key: letter,
		name: letter
	}));
	const named = [
		...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
		'Escape',
		'Enter',
		'Backspace',
		'Tab',
		'ArrowUp',
		'ArrowDown',
		'ArrowLeft',
		'ArrowRight',
		'MediaPlayPause',
		'MediaTrackPrevious',
		'MediaTrackNext'
	].map((code) => ({ code, key: code, name: code }));
	const candidates = [...letters, ...named, { code: 'Space', key: ' ', name: 'Space' }];
	const found: string[] = [];
	for (const candidate of candidates) {
		for (let mask = 0; mask < 16; mask += 1) {
			const held = { ctrlKey: !!(mask & 1), altKey: !!(mask & 2), shiftKey: !!(mask & 4), metaKey: !!(mask & 8) };
			const event: TransportKeyEvent = {
				...held,
				code: candidate.code,
				key: candidate.key,
				target: null,
				getModifierState: () => false
			};
			const answered =
				matchEscapeAction(event) !== undefined ||
				['MacIntel', 'Win32'].some((platform) => matchTransportAction(event, platform) !== undefined);
			if (!answered) continue;
			const modifiers = [
				held.ctrlKey && 'Ctrl',
				held.altKey && 'Alt',
				held.shiftKey && 'Shift',
				held.metaKey && 'Meta'
			].filter(Boolean);
			found.push([...modifiers, candidate.name].join('-'));
		}
	}
	return found;
}

describe('the shortcuts page', () => {
	// The bare-space check asks whether the press landed on an element, and the
	// server project has no DOM to supply the class it asks with.
	beforeAll(() => {
		if (typeof Element === 'undefined') vi.stubGlobal('Element', class {});
	});
	afterAll(() => vi.unstubAllGlobals());

	test.each([
		['the editor keymap', editorKeys],
		['the sync keymap', syncKeys],
		['the window transport', transportKeys]
	])('names every key %s binds', (_, collect) => {
		const bound = collect();
		expect(bound.length).toBeGreaterThan(0);
		const missing = bound.filter((key) => !documented.has(normalize(key)));
		expect(missing).toEqual([]);
	});

	test('reads the transport through its matchers', () => {
		const keys = transportKeys().map(normalize);
		for (const expected of ['Ctrl-Alt-j', 'Ctrl-k', 'Alt-l', 'F8', 'Shift-Escape', 'Space']) {
			expect(keys).toContain(normalize(expected));
		}
	});
});
