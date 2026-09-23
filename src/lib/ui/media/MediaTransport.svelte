<script lang="ts">
	import PauseIcon from 'phosphor-svelte/lib/PauseIcon';
	import PlayIcon from 'phosphor-svelte/lib/PlayIcon';
	import SkipBackIcon from 'phosphor-svelte/lib/SkipBackIcon';
	import SkipForwardIcon from 'phosphor-svelte/lib/SkipForwardIcon';
	import type { MediaPlayer } from '../state/media-player.svelte.js';
	import { describeControl } from '../state/control-tooltip.svelte.js';
	import { transportModifier } from '../state/media-shortcuts.js';
	import LoadingMark from '../primitives/LoadingMark.svelte';

	let { player }: { player: MediaPlayer } = $props();

	const fallbackModifier = transportModifier();

	// Labels and movement share the player's adaptive cue-or-nudge decision.
	const backLabel = $derived(player.backLabel);
	const forwardLabel = $derived(player.forwardLabel);

	// One keystroke per control, the one a transcriber's hands can actually reach
	// for: the Escape family. Escape toggles, Shift+Escape backs up, Alt+Escape
	// (Option+Escape) goes forward, with one key under the pinky and a modifier under
	// the other fingers or the thumb, none of which can write into the document.
	// The physical J K L triad, `F7`–`F9`, and the universal `Ctrl-Alt` fallback
	// stay in `aria-keyshortcuts`, because a control that named every way to press
	// it would be a legend rather than a name.
	const shiftEscape = fallbackModifier === 'Control' ? '⇧Esc' : 'Shift+Esc';
	const altEscape = fallbackModifier === 'Control' ? '⌥Esc' : 'Alt+Esc';
</script>

<!--
	Back, play/pause, forward: the three controls, in one implementation.

	Two surfaces show them: the strip under the editor, which is the transport's
	home, and the artwork band in the right panel, where the cover is already being
	looked at and the nearest play button was otherwise a whole column away. They
	share this rather than mirroring it by hand, for the reason the diagnostic card
	and its popover share theirs. Two copies of three buttons is two copies of
	every label rule, and `Previous line` appearing on one of them and
	`Back 2 seconds` on the other is a bug nobody would notice for months.

	**They are now identical, and the caption that used to separate them is gone.**
	The one-modifier keystroke was printed under each glyph, which is where a
	shortcut with nowhere else to live belongs, but it has somewhere else now, in
	the shared tooltip that names the control anyway. Printed as well it was the
	same fact twice, six pixels apart, in the shortest row in the window. A device
	with no pointer to produce that tooltip has no modifier keys either, so nothing
	is lost where the box cannot be opened.

	The old note, kept because the reasoning still governs anything added here:
	**a caption was a prop rather than a
	second component.** The strip prints the reliable one-modifier fallback under
	each glyph, because the strip is where the shortcut is learned: it appears with
	the song and stays attached to the action it operates. Printing them again in
	the panel would be the same legend twice on one screen, which is how a row of
	controls turns into a row of documentation. `aria-keyshortcuts` is on both,
	because that costs no pixels and a screen reader user gets the keys either way.
-->
<button
	type="button"
	class="button button--quiet media-strip__transport-button"
	onclick={() => player.transport('back')}
	aria-label={backLabel}
	aria-keyshortcuts={`Shift+Escape F7 ${fallbackModifier}+J Control+Alt+J`}
	{@attach describeControl(() => ({ label: backLabel, shortcut: shiftEscape }))}
>
	<SkipBackIcon aria-hidden="true" size={14} weight="bold" />
</button>

<button
	type="button"
	class="button media-strip__transport-button"
	onclick={() => player.transport('toggle')}
	aria-label={player.playing ? 'Pause' : 'Play'}
	aria-busy={player.starting}
	aria-keyshortcuts={`Escape F8 Space ${fallbackModifier}+K Control+Alt+K`}
	{@attach describeControl(() => ({
		label: player.playing ? 'Pause' : 'Play',
		shortcut: 'Esc'
	}))}
>
	<!--
		A press the source cannot act on yet takes the glyph's own slot rather than
		adding anything beside it, so nothing in the row moves while a track loads.

		The label stays `Pause`, because that is still what the press does: it
		calls the pending start off. `aria-busy` is what says the wait is on; a
		label reading `Loading` would name the state and lose the action.
	-->
	{#if player.starting}
		<LoadingMark />
	{:else}
		{#if player.playing}
			<PauseIcon aria-hidden="true" size={14} weight="fill" />
		{:else}
			<PlayIcon aria-hidden="true" size={14} weight="fill" />
		{/if}
	{/if}
</button>

<button
	type="button"
	class="button button--quiet media-strip__transport-button"
	onclick={() => player.transport('forward')}
	aria-label={forwardLabel}
	aria-keyshortcuts={`Alt+Escape F9 ${fallbackModifier}+L Control+Alt+L`}
	{@attach describeControl(() => ({ label: forwardLabel, shortcut: altEscape }))}
>
	<SkipForwardIcon aria-hidden="true" size={14} weight="bold" />
</button>

<style>
	/*
		The glyph, centred, and nothing under it.

		It carried the one-modifier keystroke as a caption for as long as that
		keystroke had nowhere else to live. It has somewhere now, the shared tooltip
		that names the control anyway (`describeControl`), and printed in both places
		it was the same fact twice, six pixels apart, in the shortest row in the
		window.

		The height rule it was written for still governs, so it is kept here rather
		than deleted with the caption: this row is `--control-height-lg`, every other
		control in it is `--control-height-md` plus the row's padding, and that comes
		to exactly the same. Anything stacked under a glyph again has to fit inside one
		`md` control, and `MediaStrip.svelte.test.ts` measures it against a sibling
		rather than trusting the arithmetic: every pixel this row takes is a pixel off
		the document above it.

		The strip's coarse-pointer block (`MediaStrip.svelte`) raises these to the
		touch floor.
	*/
	.media-strip__transport-button {
		display: inline-flex;
		min-height: var(--control-height-md);
		min-width: var(--control-height-md);
		flex: none;
		padding: 0 var(--space-2);
		align-items: center;
		justify-content: center;
		color: var(--color-text);
	}

	.media-strip__transport-button :global(svg) {
		flex: none;
	}

	/* `:root .button` in responsive-shared.css steps every button up to `lg` at
	   this width. Scoped, the height above would outrank it, so the step is
	   restated here to keep it. */
	@media (max-width: 46rem) {
		.media-strip__transport-button {
			min-height: var(--control-height-lg);
		}
	}
</style>
