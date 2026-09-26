/**
 * Turn a CodeMirror-style key string (`Mod-Shift-h`, `Alt-Escape`, `Ctrl-Alt-.`)
 * into the labels printed on the keys, for a Mac and for everything else.
 *
 * `Mod` is Command on a Mac and Control elsewhere, as it is in CodeMirror. Mac
 * modifiers print as Apple's glyphs, which a screen reader cannot be trusted
 * to name (⌘ is announced as "place of interest sign"), so every glyph carries
 * the name it stands for.
 */

export type KeyPlatform = 'mac' | 'other';

export interface KeyLabel {
	/** What is printed on the key. */
	label: string;
	/** The spoken name, when `label` is a glyph rather than a word. */
	name?: string;
}

const command: KeyLabel = { label: '⌘', name: 'Command' };
const control: KeyLabel = { label: '⌃', name: 'Control' };
const option: KeyLabel = { label: '⌥', name: 'Option' };
const shift: KeyLabel = { label: '⇧', name: 'Shift' };

const modifiers = {
	mac: {
		Mod: command,
		Cmd: command,
		Meta: command,
		Ctrl: control,
		Control: control,
		Alt: option,
		Option: option,
		Shift: shift
	},
	other: {
		Mod: { label: 'Ctrl' },
		Cmd: { label: 'Meta' },
		Meta: { label: 'Meta' },
		Ctrl: { label: 'Ctrl' },
		Control: { label: 'Ctrl' },
		Alt: { label: 'Alt' },
		Option: { label: 'Alt' },
		Shift: { label: 'Shift' }
	}
} satisfies Record<KeyPlatform, Record<string, KeyLabel>>;

const namedKeys = {
	Escape: { label: 'Esc' },
	Esc: { label: 'Esc' },
	Space: { label: 'Space' },
	' ': { label: 'Space' },
	Enter: { label: 'Enter' },
	Tab: { label: 'Tab' },
	Backspace: { label: 'Backspace' },
	Delete: { label: 'Delete' },
	Home: { label: 'Home' },
	End: { label: 'End' },
	PageUp: { label: 'Page Up' },
	PageDown: { label: 'Page Down' },
	ArrowUp: { label: '↑', name: 'Up arrow' },
	ArrowDown: { label: '↓', name: 'Down arrow' },
	ArrowLeft: { label: '←', name: 'Left arrow' },
	ArrowRight: { label: '→', name: 'Right arrow' },
	MediaPlayPause: { label: 'Play/Pause' },
	MediaTrackPrevious: { label: 'Previous track' },
	MediaTrackNext: { label: 'Next track' }
} satisfies Record<string, KeyLabel>;

/** Own keys only, so `constructor` is not a key name. */
function lookup(table: Readonly<Record<string, KeyLabel>>, name: string): KeyLabel | undefined {
	return Object.hasOwn(table, name) ? table[name] : undefined;
}

/** CodeMirror's own split: a trailing `-` is the minus key, not a separator. */
function parts(combo: string): string[] {
	return combo.split(/-(?!$)/u);
}

export function formatCombo(combo: string, platform: KeyPlatform): KeyLabel[] {
	const names = parts(combo);
	const key = names.pop() ?? '';
	return [
		...names.map((name) => {
			const label = lookup(modifiers[platform], name);
			if (!label) throw new Error(`Unknown modifier "${name}" in "${combo}"`);
			return label;
		}),
		lookup(namedKeys, key) ?? { label: key.length === 1 ? key.toUpperCase() : key }
	];
}

/** Whether a Mac reader presses something different from everyone else. */
export function comboDiffersOnMac(combo: string): boolean {
	const mac = formatCombo(combo, 'mac');
	const other = formatCombo(combo, 'other');
	return mac.some((key, index) => key.label !== other[index]?.label);
}
