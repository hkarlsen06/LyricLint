/**
 * Every key the workbench binds, as the shortcuts page prints it: one list per
 * page section, keyed by that section's catalog id. Combos are CodeMirror-style
 * (`Mod` is Command on a Mac and Ctrl elsewhere). `shortcuts.test.ts` fails when
 * the editor keymap, the sync keymap, or the window transport binds a key this
 * list does not name.
 */
export interface Shortcut {
	combos: readonly string[];
	action: string;
	/** Where or when the key answers, or the platforms it is limited to. */
	context?: string;
}

export type ShortcutSection = 'editing' | 'findings' | 'playback' | 'sync';

export const shortcuts = {
	editing: [
		{ combos: ['Mod-Shift-h'], action: "Choose a section header for the caret's section" },
		{ combos: ['Ctrl-Alt-u'], action: 'Write [?] over the selection, or at the caret' },
		{
			combos: ['Ctrl-Alt-p'],
			action: 'Assign performers to the selected lines',
			context: 'Select lyric lines inside one section that has a header'
		},
		{
			combos: ['Alt-p'],
			action: 'Assign performers to the selected lines',
			context: 'Windows and Linux only'
		},
		{
			combos: ['Mod-Shift-l'],
			action: 'Turn Edit this section only on or off',
			context: 'Caret in a linked section'
		},
		{
			combos: ['Escape'],
			action: 'Turn Edit this section only off',
			context: 'No audio attached (with audio, Escape plays and pauses)'
		},
		{ combos: ['Mod-f'], action: 'Open find and replace', context: 'Anywhere in the workbench' },
		{ combos: ['Mod-g', 'F3'], action: 'Next match' },
		{ combos: ['Mod-Shift-g', 'Shift-F3'], action: 'Previous match' },
		{ combos: ['Mod-z'], action: 'Undo' },
		{ combos: ['Mod-Shift-z'], action: 'Redo', context: 'Mac and Linux' },
		{ combos: ['Mod-y'], action: 'Redo', context: 'Windows and Linux' }
	],
	findings: [
		{
			combos: ['Mod-.'],
			action: 'Open the nearest finding with a fix; press again to apply the fix',
			context: 'Anywhere in the workbench'
		},
		{ combos: ['F2', 'Mod-Shift-.', 'Ctrl-Alt-.'], action: 'Next finding' },
		{ combos: ['Shift-F2', 'Ctrl-Alt-,'], action: 'Previous finding' },
		{
			combos: ['Alt-Shift-ArrowDown'],
			action: 'Next finding in the Review list',
			context: 'Focus outside the lyrics and text fields'
		},
		{
			combos: ['Alt-Shift-ArrowUp'],
			action: 'Previous finding in the Review list',
			context: 'Focus outside the lyrics and text fields'
		},
		{ combos: ['Escape'], action: "Close a finding's popover in the lyrics" }
	],
	playback: [
		{ combos: ['Escape', 'F8', 'Ctrl-Alt-k', 'MediaPlayPause'], action: 'Play or pause' },
		{
			combos: ['Shift-Escape', 'F7', 'Ctrl-Alt-j', 'MediaTrackPrevious'],
			action: 'Back to the previous timed line, or 2 seconds'
		},
		{
			combos: ['Alt-Escape', 'F9', 'Ctrl-Alt-l', 'MediaTrackNext'],
			action: 'Forward to the next timed line, or 2 seconds'
		},
		{
			combos: ['Space'],
			action: 'Play or pause',
			context: 'Focus outside the lyrics, text fields, and buttons'
		},
		{ combos: ['Ctrl-k'], action: 'Play or pause', context: 'Mac only' },
		{ combos: ['Ctrl-j'], action: 'Back', context: 'Mac only' },
		{ combos: ['Ctrl-l'], action: 'Forward', context: 'Mac only' },
		{ combos: ['Alt-k'], action: 'Play or pause', context: 'Windows and Linux only' },
		{ combos: ['Alt-j'], action: 'Back', context: 'Windows and Linux only' },
		{ combos: ['Alt-l'], action: 'Forward', context: 'Windows and Linux only' },
		{
			combos: ['Escape'],
			action: "Load or reconnect the 'scribe's remembered audio",
			context: 'The player shows Load audio or Reconnect audio'
		},
		{
			combos: ['Ctrl-Alt-Enter'],
			action: "Play from the caret's line, or the nearest timed line above it"
		}
	],
	sync: [
		{ combos: ['Ctrl-Alt-m'], action: "Time the caret's line at the current playback position" },
		{
			combos: ['Space', 'Enter'],
			action: 'Time the line that is starting now',
			context: 'While syncing; Space also works outside the lyrics'
		},
		{
			combos: ['Backspace', 'ArrowUp'],
			action: 'Take back the last tap and back the audio up to the line before',
			context: 'While syncing'
		},
		{ combos: ['Escape'], action: 'Stop syncing', context: 'While syncing' }
	]
} satisfies Record<ShortcutSection, readonly Shortcut[]>;
