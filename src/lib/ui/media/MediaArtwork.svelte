<script lang="ts">
	import type { MediaStore } from '../state/media-store.svelte.js';
	import MediaTransport from './MediaTransport.svelte';

	let {
		media,
		open = true,
		onToggle
	}: { media: MediaStore; open?: boolean; onToggle?: (open: boolean) => void } = $props();

	const player = $derived(media.player);
</script>

<!--
	The cover, in the same band the YouTube player occupies and for the same
	reason: it is the part of the media feature that is looked at rather than
	operated, so two hundred pixels of it costs a scroll here and would cost the
	document anywhere else.

	**It folds away, and the video does not.** YouTube's embed terms require their
	player visible and unobscured, so a collapse control there would be a control
	for breaking them; Apple asks for attribution — which the strip's badge
	carries — and nothing at all about a picture. This is the one band in the panel
	a user can take their height back from.

	**The fold is the controller's, not this component's**, and that is what makes
	it stick. Two things would otherwise forget it: this band is destroyed whenever
	the attached source changes, so a local flag would reset on every swapped song;
	and a reload would start over. It is stored beside the current draft and the
	recent languages, so it is covered by the workspace backup and cleared by
	`Delete all local data` — which a `localStorage` key would not be.

	It is also a plain control rather than a `<details>`, and that is a correction.
	A disclosure was right while the bar was a name and a chevron — the platform
	owned the state, the keyboard and the semantics for free. It stopped being
	right the moment controls arrived: a `<summary>` is one activation target, so
	every button inside it has to `stopPropagation` or pressing play folds the
	picture away. Three opt-outs from an element's whole reason for existing is the
	element being wrong, not the buttons.

	The bar is what is playing and the fold, at the strip's own height, so the two
	rows at the feet of the two columns read as siblings rather than as two
	different ideas of what a media bar is.

	The transport is on the picture, where every media player in the world puts it
	and where the pointer already is if the cover is what you are looking at.
-->
<div class="media-artwork">
	<div class="media-artwork__bar">
		<span class="media-artwork__name" title={player.name}>{player.name}</span>

		<button
			type="button"
			class="button--quiet icon-button media-artwork__toggle"
			aria-expanded={open}
			aria-label={open ? 'Hide artwork' : 'Show artwork'}
			title={open ? 'Hide artwork' : 'Show artwork'}
			onclick={() => onToggle?.(!open)}
		>
			<svg
				class="media-artwork__chevron"
				aria-hidden="true"
				viewBox="0 0 16 16"
				width="12"
				height="12"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="m4 6 4 4 4-4" />
			</svg>
		</button>
	</div>

	{#if open}
		<div class="media-artwork__stage">
			<!--
				Decorative, and deliberately so. The track is named on the bar directly
				above, so an alt describing it would announce the same fact twice — and
				there is nothing else in a cover for a screen reader to have.
			-->
			<img class="media-artwork__cover" src={player.artwork} alt="" />

			<!--
				The transport over the picture, at the size a player's controls are
				rather than the size a chrome row's are.

				It draws on a scrim rather than straight onto the cover, because the
				surface underneath is somebody else's artwork and half the covers in
				the world are pale — white glyphs alone would vanish on a third of
				them. That is also why the two colors here are the only ones in the
				system that do not follow the scheme: they answer to the picture.

				No shortcut captions. The strip prints that legend already, and the
				same legend twice on one screen is how a row of controls turns into a
				row of documentation.
			-->
			<div class="media-artwork__controls">
				<MediaTransport {player} captions={false} />
			</div>
		</div>
	{/if}
</div>
