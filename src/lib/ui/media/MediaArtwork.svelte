<script lang="ts">
	import { X } from 'lucide-svelte';
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
	 * mark was drawn — a standing attribution breach on the one surface both
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
	 * attachment and the details land with the read behind it — so for that moment,
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
	The cover, in the same band the YouTube player occupies and for the same
	reason: it is the part of the media feature that is looked at rather than
	operated, so its pixels cost a scroll here and would cost the document
	anywhere else.

	**The compact row is the only shape.** This band used to expand into a stage —
	the full-width picture with the facts and a second transport scrimmed onto it —
	behind a fold the controller remembered per workspace. What the stage actually
	spent was two hundred pixels of the findings column on a picture nobody
	operates, and what it carried (a second copy of the transport) was a row of
	buttons for a picture nobody is looking at. The row is the band now: thumbnail,
	title over artist, and the mark at the far end.

	**Looking at the picture bigger is a press on the picture.** The thumbnail is
	a button and the full-size cover opens in a modal — a modal because looking at
	artwork is a detour from transcribing, and the way back is every way out a
	dialog already has. The dialog also carries the two artwork commands the Song
	panel offers, through the same `ArtworkActions` component, so the pair cannot
	drift between the two surfaces.

	**It never folds a video.** YouTube keeps its own player in this band
	(`drawsCoverBand`), whose embed terms want it visible — this row is only ever
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
					it, so an alt describing it would announce the same fact twice — and
					there is nothing else in a cover for a screen reader to have. The
					button carries the name the press needs.
				-->
				<img class="media-artwork__cover" src={cover} alt="" />
			</button>
		{/if}

		<!-- Title over artist, centred against the thumbnail: the song is what
		     the row is about and the artist qualifies it. -->
		<div class="media-artwork__meta">
			<span class="media-artwork__title" {title}>{title}</span>
			{#if artist}
				<span class="media-artwork__artist" title={artist}>{artist}</span>
			{/if}
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
						<X aria-hidden="true" size={16} strokeWidth={2.25} />
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
