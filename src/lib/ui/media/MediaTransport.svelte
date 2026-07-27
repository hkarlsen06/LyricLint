<script lang="ts">
	import type { MediaPlayer } from '../state/media-player.svelte.js';
	import { transportModifier } from '../state/media-shortcuts.js';
	import LoadingMark from '../primitives/LoadingMark.svelte';

	let { player, captions = true }: { player: MediaPlayer; captions?: boolean } = $props();

	const fallbackModifier = transportModifier();
	const fallbackModifierKey = fallbackModifier === 'Control' ? '⌃' : fallbackModifier;

	// Once the song has timed lines the side keys step between them, so the
	// controls say so. A button labelled with a number of seconds it no longer
	// moves is worse than one with no number on it at all.
	const timed = $derived(player.cuePoints.length > 0);
	const backLabel = $derived(timed ? 'Previous line' : 'Back 2 seconds');
	const forwardLabel = $derived(timed ? 'Next line' : 'Forward 2 seconds');
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

	**The captions are the one difference, and they are a prop rather than a
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
	title={`${backLabel} (F7 · ${fallbackModifier}+J)`}
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
	{#if captions}
		<kbd class="media-strip__key" aria-hidden="true">{fallbackModifierKey}J</kbd>
	{/if}
</button>

<button
	type="button"
	class="button button--quiet media-strip__transport-button"
	onclick={() => player.transport('toggle')}
	aria-label={player.playing ? 'Pause' : 'Play'}
	aria-busy={player.starting}
	aria-keyshortcuts={`F8 Space ${fallbackModifier}+K Control+Alt+K`}
	title={`${player.playing ? 'Pause' : 'Play'} (F8 · ${fallbackModifier}+K)`}
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
	{#if captions}
		<kbd class="media-strip__key" aria-hidden="true">{fallbackModifierKey}K</kbd>
	{/if}
</button>

<button
	type="button"
	class="button button--quiet media-strip__transport-button"
	onclick={() => player.transport('forward')}
	aria-label={forwardLabel}
	aria-keyshortcuts={`F9 ${fallbackModifier}+L Control+Alt+L`}
	title={`${forwardLabel} (F9 · ${fallbackModifier}+L)`}
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
	{#if captions}
		<kbd class="media-strip__key" aria-hidden="true">{fallbackModifierKey}L</kbd>
	{/if}
</button>
