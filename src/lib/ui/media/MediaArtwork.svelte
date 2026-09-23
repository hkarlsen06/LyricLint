<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import type { MediaStore } from '../state/media-store.svelte.js';
	import ArtworkActions from './ArtworkActions.svelte';
	import MediaAttribution from './MediaAttribution.svelte';

	let { media, announce }: { media: MediaStore; announce?: (message: string) => void } = $props();

	const player = $derived(media.player);
	const cover = $derived(player.artwork);
	/**
	 * A song that is named but has no cover, which is not merely the wait.
	 *
	 * A catalogue read that comes back 404 or 403 never reports a picture at all,
	 * and gating the whole band on one left that song anonymous for as long as it
	 * was attached: the strip does not name a catalogue source (`drawsCoverBand`
	 * hands that job here), so nothing on screen said what was playing and neither
	 * mark was drawn, a standing attribution breach on the one surface both
	 * Spotify and Apple require it on.
	 *
	 * So the row draws on the *name*, and the picture only decides whether there
	 * is a thumbnail at its head.
	 */
	const named = $derived(player.name !== undefined);

	/**
	 * Artist and title apart, with the one-line name as the fallback.
	 *
	 * Both catalogue sources report the two fields, but the name lands with the
	 * attachment and the details land with the read behind it, so for that moment,
	 * and for any source that reports no details at all, the row says the one
	 * thing it actually knows rather than an empty half.
	 */
	const artist = $derived(player.songDetails?.artist);
	const title = $derived(player.songDetails?.title ?? player.name);

	let dialog: HTMLDialogElement | undefined = $state();
	let trigger: HTMLButtonElement | undefined = $state();

	function open(): void {
		dialog?.showModal();
	}

	function close(): void {
		dialog?.close();
		trigger?.focus();
	}

	// A modal `<dialog>` has a real backdrop, so it is the one transient surface
	// that dismisses by comparing the press against itself rather than through
	// `dismissOnOutside` (the LanguagePicker's own rule).
	function handleBackdropClick(event: MouseEvent): void {
		if (event.target === dialog) close();
	}
</script>

<!--
	The catalogue identity row, above playback inside MediaStrip. Keeping the
	song and source link beside the controls makes their ownership explicit.
	YouTube keeps its visible frame in the sidebar.

	**The compact row is the only shape.** This band used to expand into a stage,
	the full-width picture with the facts and a second transport scrimmed onto it,
	behind a fold the controller remembered per workspace. What the stage actually
	spent was two hundred pixels of the findings column on a picture nobody
	operates, and what it carried (a second copy of the transport) was a row of
	buttons for a picture nobody is looking at. The row is the band now: thumbnail,
	title over artist, and the mark at the far end.

	**Looking at the picture bigger is a press on the picture.** The thumbnail is
	a button and the full-size cover opens in a modal, because looking at
	artwork is a detour from transcribing, and the way back is every way out a
	dialog already has. The dialog also carries the two artwork commands the Song
	panel offers, through the same `ArtworkActions` component, so the pair cannot
	drift between the two surfaces.

	**It never folds a video.** YouTube keeps its own player in this band
	(`drawsCoverBand`), whose embed terms want it visible. This row is only ever
	the catalogue sources' answer.
-->
{#if cover || named}
	<div class="media-artwork">
		{#if cover}
			<button
				bind:this={trigger}
				type="button"
				class="media-artwork__thumb"
				aria-haspopup="dialog"
				aria-label="View album art"
				title="View album art"
				onclick={open}
			>
				<!--
					Decorative, and deliberately so. The track is named in the row beside
					it, so an alt describing it would announce the same fact twice, and
					there is nothing else in a cover for a screen reader to have. The
					button carries the name the press needs.
				-->
				<img class="media-artwork__cover" src={cover} alt="" />
			</button>
		{/if}

		<!-- Title over artist, centred against the thumbnail: the song is what
		     the row is about and the artist qualifies it. -->
		<div class="media-artwork__identity">
			<div class="media-artwork__meta">
				<span class="media-artwork__title" {title}>{title}</span>
				{#if artist}
					<span class="media-artwork__artist" title={artist}>{artist}</span>
				{/if}
			</div>
		</div>

		<!-- The mark at the far end: the one thing in the row that has to be seen
		     rather than pressed, and the half that is required. -->
		<div class="media-artwork__aside">
			<MediaAttribution {media} />
		</div>
	</div>

	{#if cover}
		<dialog
			bind:this={dialog}
			class="artwork-dialog"
			aria-labelledby="artwork-dialog-title"
			onclick={handleBackdropClick}
		>
			<div class="artwork-dialog__surface">
				<div class="artwork-dialog__header">
					<strong id="artwork-dialog-title" {title}>{title ?? 'Album art'}</strong>
					<button
						type="button"
						class="icon-button button--quiet"
						aria-label="Close"
						onclick={close}
					>
						<XIcon aria-hidden="true" size={16} weight="bold" />
					</button>
				</div>
				<!-- The same picture at the size the source offered it; the header
				     names the track, so the image itself stays decorative here too. -->
				<img class="artwork-dialog__cover" src={cover} alt="" />
				<div class="artwork-dialog__actions">
					<ArtworkActions artwork={cover} name={player.name} {announce} />
				</div>
			</div>
		</dialog>
	{/if}
{/if}

<style>
	/*
	 * The cover, in the video's band and under the video's rules: chrome, a hairline
	 * over it, flush with the column.
	 *
	 * The picture is the surface here rather than a thing inside one. This band used
	 * to be a chrome bar with a cover under it: a whole row of the panel's height
	 * spent on two facts and one control, above a picture with four unused corners.
	 * The facts sit on the artwork now, and the row that is left is the folded state.
	 *
	 * `--media-thumb` is the folded picture, and it is read off the strip's control
	 * height rather than picked: the folded row is a thumbnail beside a stack of
	 * artist, title and mark, and tying it to that token keeps it in the same family
	 * as the row at the foot of the other column.
	 */
	.media-artwork {
		--media-thumb: calc(var(--control-height-lg) * 2);

		display: flex;
		flex: none;
		gap: var(--space-3);
		align-items: center;
		padding: var(--space-3);
		background: var(--color-chrome);
	}

	/*
	 * The thumbnail is the way to the full-size picture, so it is a button rather
	 * than a box: no border and no fill of its own, because the press target *is*
	 * the picture, and a frame around it would be a card inside the row.
	 */
	.media-artwork__thumb {
		display: block;
		width: var(--media-thumb);
		flex: none;
		overflow: hidden;
		padding: 0;
		border: 0;
		border-radius: var(--radius-control);
		background: none;
		cursor: pointer;
	}

	.media-artwork__thumb:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	.media-artwork__cover {
		display: block;
		width: 100%;
		/* Square because a cover is square. Nothing is boxed: the picture sits on the
		   band's own chrome, so it needs no frame of its own. */
		aspect-ratio: 1;
		object-fit: cover;
		background: var(--color-canvas);
	}

	/* Both halves ellipsize, so a long title never pushes the mark off the end of
	   its own row. */
	.media-artwork__artist,
	.media-artwork__title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/*
	 * Title over artist, centred against the thumbnail: the song is what the row
	 * is about and the artist qualifies it. These two lines *are* the row, with a
	 * whole thumbnail's height to fill, which is why they sit a step up from
	 * caption type.
	 */
	.media-artwork__identity {
		display: flex;
		flex: 1 1 auto;
		min-width: 0;
		align-items: center;
		gap: var(--space-2);
	}

	.media-artwork__meta {
		display: flex;
		flex: 0 1 auto;
		min-width: 0;
		flex-direction: column;
		gap: var(--space-1);
		align-items: start;
		justify-content: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.media-artwork__meta .media-artwork__title {
		max-width: 100%;
		color: var(--color-text);
	}

	.media-artwork__meta .media-artwork__artist {
		max-width: 100%;
	}

	/* The mark alone at the far end: the one thing in the row that has to be seen
	   rather than pressed. */
	.media-artwork__aside {
		display: flex;
		flex: none;
		flex-direction: column;
		gap: var(--space-2);
		align-items: end;
		justify-content: center;
	}

	/*
	 * The full-size picture, behind a press on the thumbnail. Looking at artwork is
	 * a detour from transcribing, which is what a modal is for, and the dialog is
	 * where the two artwork commands ride, under the picture they act on.
	 *
	 * The width caps against the viewport's *height* as well as its width, because
	 * the surface is a square picture plus two rows of chrome: on a short window a
	 * width-only cap would push the actions below the fold of the dialog itself.
	 */
	.artwork-dialog {
		width: min(28rem, calc(100vw - var(--space-6)), calc(100dvh - 11rem));
		max-width: none;
		padding: 0;
		border: 0;
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}

	.artwork-dialog::backdrop {
		background: var(--color-backdrop);
	}

	.artwork-dialog__header {
		display: flex;
		min-height: 3.25rem;
		padding: var(--space-4) var(--space-4) var(--space-2) var(--space-5);
		gap: var(--space-3);
		align-items: center;
		justify-content: space-between;
	}

	.artwork-dialog__header strong {
		overflow: hidden;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.artwork-dialog__cover {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		background: var(--color-canvas);
	}

	.artwork-dialog__actions {
		display: flex;
		padding: var(--space-3) var(--space-5) var(--space-5);
	}
</style>
