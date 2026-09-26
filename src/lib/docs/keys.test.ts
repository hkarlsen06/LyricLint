import { describe, expect, it } from 'vitest';
import { comboDiffersOnMac, formatCombo } from './keys.js';

const labels = (combo: string, platform: 'mac' | 'other') =>
	formatCombo(combo, platform).map((key) => key.label);

describe('formatCombo', () => {
	it('prints Mod as Ctrl elsewhere and Command on a Mac, with spoken names on glyphs', () => {
		expect(labels('Mod-Shift-h', 'other')).toEqual(['Ctrl', 'Shift', 'H']);
		expect(formatCombo('Mod-Shift-h', 'mac')).toEqual([
			{ label: '⌘', name: 'Command' },
			{ label: '⇧', name: 'Shift' },
			{ label: 'H' }
		]);
	});

	it('keeps punctuation keys and a trailing minus as keys', () => {
		expect(labels('Ctrl-Alt-.', 'other')).toEqual(['Ctrl', 'Alt', '.']);
		expect(labels('Ctrl-Alt-.', 'mac')).toEqual(['⌃', '⌥', '.']);
		expect(labels('Mod--', 'other')).toEqual(['Ctrl', '-']);
	});

	it('names the special keys', () => {
		expect(labels('Escape', 'other')).toEqual(['Esc']);
		expect(labels('Space', 'mac')).toEqual(['Space']);
		expect(labels('Shift-F2', 'other')).toEqual(['Shift', 'F2']);
		expect(labels('Alt-Escape', 'mac')).toEqual(['⌥', 'Esc']);
		expect(formatCombo('ArrowUp', 'other')).toEqual([{ label: '↑', name: 'Up arrow' }]);
		expect(labels('MediaPlayPause', 'mac')).toEqual(['Play/Pause']);
		expect(labels('MediaTrackPrevious', 'other')).toEqual(['Previous track']);
		expect(labels('MediaTrackNext', 'other')).toEqual(['Next track']);
	});

	it('refuses a modifier it does not know rather than printing it', () => {
		expect(() => formatCombo('Hyper-a', 'other')).toThrow(/Hyper/u);
	});
});

describe('comboDiffersOnMac', () => {
	it('is false only when every key prints the same', () => {
		expect(comboDiffersOnMac('Escape')).toBe(false);
		expect(comboDiffersOnMac('F8')).toBe(false);
		expect(comboDiffersOnMac('Shift-Escape')).toBe(true);
		expect(comboDiffersOnMac('Mod-k')).toBe(true);
	});
});
