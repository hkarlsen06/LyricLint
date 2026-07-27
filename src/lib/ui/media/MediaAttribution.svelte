<script lang="ts">
	// Apple's own artwork, unmodified, because their identity guidelines say to use
	// theirs rather than draw one — see the comment on the markup below.
	import appleMusicBadgeBlack from '$lib/assets/apple-music-listen-on-black.svg';
	import appleMusicBadgeWhite from '$lib/assets/apple-music-listen-on-white.svg';
	import type { MediaStore } from '../state/media-store.svelte.js';

	let { media }: { media: MediaStore } = $props();

	const player = $derived(media.player);
</script>

<!--
	The mark that says whose catalogue this is, in one implementation for the two
	surfaces that can be showing the song.

	It is a component rather than markup in the strip because the name it belongs
	beside moves: a song with a cover is named on the artwork band's own bar, and
	one without is named in the transport. Two copies of these two links would be
	two copies of every rule below, and the first to drift would be the one nobody
	is looking at — which, for an attribution, is the copy that gets a
	quota-extension request refused.

	**Spotify's Design Guidelines require the mark wherever their content plays**,
	beside the track and artist, with a way back to the track on Spotify. It is
	also the most common reason such a request is refused.

	**Apple asks for the same thing** and supplies the artwork for it. Three rules
	from their identity guidelines shape every part of the badge and none of them
	is discretionary: use their artwork rather than drawing one, never remove the
	`Listen on` call to action, and never recolor it. So this is the whole lockup
	at its own aspect ratio, carrying no `currentColor` — even the white file keeps
	Apple's gradient on the note, and only the type is white.

	`<picture>` rather than a Svelte-side theme value, because the theme here is
	`prefers-color-scheme` and therefore CSS: the white lockup is for the dark
	surface and the black one for the light, and the browser fetches exactly one.

	Both open a new tab, because the workbench is a document being typed into and a
	link that navigated away from it would lose the user's place.
-->
{#if player.sourceKind === 'spotify' && media.trackId}
	<a
		class="media-attribution__spotify"
		href={`https://open.spotify.com/track/${media.trackId}`}
		target="_blank"
		rel="noopener noreferrer"
		aria-label={`Open ${player.name} on Spotify`}
		title="Open on Spotify"
	>
		<svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="currentColor">
			<path
				d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0Zm5.5 17.31a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 1 1-.33-1.46c4.57-1.04 8.5-.59 11.66 1.34.35.22.46.68.25 1.03Zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 1 1-.54-1.8c4.36-1.32 9.78-.68 13.49 1.6.44.27.58.85.31 1.29Zm.13-3.4C15.23 8.34 8.85 8.13 5.15 9.25a1.12 1.12 0 1 1-.65-2.15c4.25-1.29 11.29-1.04 15.74 1.6a1.12 1.12 0 1 1-1.14 1.94Z"
			/>
		</svg>
	</a>
{/if}

{#if player.sourceKind === 'apple' && media.songId}
	<a
		class="media-attribution__apple"
		href={`https://music.apple.com/song/${media.songId}`}
		target="_blank"
		rel="noopener noreferrer"
		aria-label={`Listen to ${player.name} on Apple Music`}
		title="Listen on Apple Music"
	>
		<picture>
			<source srcset={appleMusicBadgeWhite} media="(prefers-color-scheme: dark)" />
			<!-- The link is already named, so the badge is decorative here; an alt
			     repeating `Listen on Apple Music` would announce the same control
			     twice. -->
			<img src={appleMusicBadgeBlack} alt="" />
		</picture>
	</a>
{/if}
