<script lang="ts">
	import type { MediaPlayer } from '../state/media-player.svelte.js';
	import { describeControl } from '../state/control-tooltip.svelte.js';
	import { transportModifier } from '../state/media-shortcuts.js';
	import LoadingMark from '../primitives/LoadingMark.svelte';

	let { player }: { player: MediaPlayer } = $props();

	const fallbackModifier = transportModifier();

	// Once the song has timed lines the side keys step between them, so the
	// controls say so. A button labelled with a number of seconds it no longer
	// moves is worse than one with no number on it at all.
	const timed = $derived(player.cuePoints.length > 0);
	const backLabel = $derived(timed ? 'Previous line' : 'Back 2 seconds');
	const forwardLabel = $derived(timed ? 'Next line' : 'Forward 2 seconds');

	// One keystroke, the one a transcriber's hands can actually reach for: the
	// one-modifier triad on the physical J K L keys. `F7`–`F9` and the universal
	// `Ctrl-Alt` fallback stay in `aria-keyshortcuts`, because a control that
	// listed every way to press it would be a legend rather than a name — and the
	// function row is the alternative nobody reaches for first.
	const key = (letter: string): string =>
		fallbackModifier === 'Control' ? `⌃${letter}` : `${fallbackModifier}+${letter}`;
</script>

<!--
	Back, play/pause, forward — the three controls, in one implementation.

	Two surfaces show them: the strip under the editor, which is the transport's
	home, and the artwork band in the right panel, where the cover is already being
	looked at and the nearest play button was otherwise a whole column away. They
	share this rather than mirroring it by hand, for the reason the diagnostic card
	and its popover share theirs — two copies of three buttons is two copies of
	every label rule, and `Previous line` appearing on one of them and
	`Back 2 seconds` on the other is a bug nobody would notice for months.

	**They are now identical, and the caption that used to separate them is gone.**
	The one-modifier keystroke was printed under each glyph, which is where a
	shortcut with nowhere else to live belongs — but it has somewhere else now, in
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
	aria-keyshortcuts={`F7 ${fallbackModifier}+J Control+Alt+J`}
	{@attach describeControl(() => ({ label: backLabel, shortcut: key('J') }))}
>
	<svg
		aria-hidden="true"
		viewBox="0 0 16 16"
		width="14"
		height="14"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M13 3.5v9L6.5 8Z" />
		<path d="M3.5 3.5v9" />
	</svg>
</button>

<button
	type="button"
	class="button button--quiet media-strip__transport-button"
	onclick={() => player.transport('toggle')}
	aria-label={player.playing ? 'Pause' : 'Play'}
	aria-busy={player.starting}
	aria-keyshortcuts={`F8 Space ${fallbackModifier}+K Control+Alt+K`}
	{@attach describeControl(() => ({
		label: player.playing ? 'Pause' : 'Play',
		shortcut: key('K')
	}))}
>
	<!--
		A press the source cannot act on yet takes the glyph's own slot rather than
		adding anything beside it, so nothing in the row moves while a track loads.

		The label stays `Pause`, because that is still what the press does — it
		calls the pending start off. `aria-busy` is what says the wait is on; a
		label reading `Loading` would name the state and lose the action.
	-->
	{#if player.starting}
		<LoadingMark />
	{:else}
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			width="14"
			height="14"
			fill="currentColor"
			stroke="none"
		>
			{#if player.playing}
				<path d="M4 3h2.6v10H4zM9.4 3H12v10H9.4z" />
			{:else}
				<path d="M4.5 2.8 13 8l-8.5 5.2Z" />
			{/if}
		</svg>
	{/if}
</button>

<button
	type="button"
	class="button button--quiet media-strip__transport-button"
	onclick={() => player.transport('forward')}
	aria-label={forwardLabel}
	aria-keyshortcuts={`F9 ${fallbackModifier}+L Control+Alt+L`}
	{@attach describeControl(() => ({ label: forwardLabel, shortcut: key('L') }))}
>
	<svg
		aria-hidden="true"
		viewBox="0 0 16 16"
		width="14"
		height="14"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M3 3.5v9L9.5 8Z" />
		<path d="M12.5 3.5v9" />
	</svg>
</button>
