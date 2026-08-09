<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import type { MediaStore } from '../state/media-store.svelte.js';
	import MediaTransport from './MediaTransport.svelte';
	import MediaAttribution from './MediaAttribution.svelte';

	let {
		media,
		open = true,
		onToggle
	}: { media: MediaStore; open?: boolean; onToggle?: (open: boolean) => void } = $props();

	const player = $derived(media.player);
	/**
	 * The picture is the whole layout, so there is no band at all until it lands.
	 *
	 * The version before this one stood the row up at attach time with the
	 * thumbnail's slot empty, on the reasoning that a layout already standing is
	 * one the cover can arrive into. What that produced was a tall band of chrome
	 * holding two lines of text and a badge — the biggest, emptiest thing in the
	 * panel, on screen for exactly as long as the catalogue read, which is the one
	 * moment there is nothing to look at. Drawing nothing is the better wait.
	 */
	const cover = $derived(player.artwork);

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
</script>

<!--
	The cover, in the same band the YouTube player occupies and for the same
	reason: it is the part of the media feature that is looked at rather than
	operated, so two hundred pixels of it costs a scroll here and would cost the
	document anywhere else.

	**The picture is the surface, not a thing inside one.** This band used to be a
	chrome bar with a cover under it — the strip's bar, repeated at the foot of the
	other column, carrying the name and the fold. What that spent was a whole row
	of the panel's height on two facts and one control, above a picture that had
	four unused corners. Everything sits on the artwork now: artist and title along
	the top, the transport and the mark along the bottom, and the fold at the end
	of the title's own row.

	**Two scrims, top and bottom, and they are the contrast.** What the text reads
	against is somebody else's album art and half the covers in the world are pale,
	so white alone vanishes on a third of them. Each band is a gradient rather than
	a flat fill, so the picture is given up gradually — a hard edge across a cover
	reads as a second box drawn over it — and the middle of the artwork, which is
	the part worth looking at, stays clear.

	**Each end is a row rather than two corners.** Absolutely-placed corners
	collide the moment an artist and a title are both long; a flex row with the
	ellipsis on both halves cannot.

	**Folded, the picture scales down to the left** and the facts stand beside it:
	artist, title, and the mark under them, with no transport — the controls under
	the document are the ones being used while typing, and a second copy of them
	beside a thumbnail is a row of buttons for a picture nobody is looking at. The
	`<img>` is outside both branches so it is the *same element* in both states,
	which is what lets the size be a transition rather than a swap. That is a
	deliberate exception to this band's own rule that the fold is instant: what
	moves is the picture the user just pressed, and it moves to where it is going.

	**It folds and the video does not.** YouTube's embed terms require their player
	visible and unobscured, so a collapse control there would be a control for
	breaking them; Apple asks for attribution — which the folded row carries under
	the title — and nothing at all about a picture.

	**The fold is the controller's, not this component's**, and that is what makes
	it stick. Two things would otherwise forget it: this band is destroyed whenever
	the attached source changes, so a local flag would reset on every swapped song;
	and a reload would start over. It is stored beside the current draft and the
	recent languages, so it is covered by the workspace backup and cleared by
	`Delete all local data` — which a `localStorage` key would not be.

	**Before the cover lands, nothing draws.** The picture is the layout, so a band
	without one is a tall box of chrome around two lines of text — the emptiest
	thing in the panel, for exactly as long as the catalogue read takes. The strip
	says nothing either (`drawsCoverBand`), so the song is silent on screen until
	there is something to show, which is a shorter wait than either half of the
	alternative.

	**Expanded, the picture is not in anything.** No inset and no corner rounding:
	it is the full width of the panel, edge to edge, with the scrims and everything
	on them riding directly on the artwork. The padding and the radius belong to
	the folded state, where the picture really is a thumbnail sitting in a row —
	and they are on the transition with the width, so the fold is one movement
	rather than a scale plus a jump.
-->
{#snippet fold()}
	<button
		type="button"
		class="button--quiet icon-button media-artwork__toggle"
		aria-expanded={open}
		aria-label={open ? 'Hide artwork' : 'Show artwork'}
		title={open ? 'Hide artwork' : 'Show artwork'}
		onclick={() => onToggle?.(!open)}
	>
		<ChevronDown class="media-artwork__chevron" aria-hidden="true" size={12} strokeWidth={2.25} />
	</button>
{/snippet}

{#if cover}
	<div class="media-artwork" class:media-artwork--folded={!open}>
		<div class="media-artwork__stage">
			<!--
				Decorative, and deliberately so. The track is named on the picture
				itself, so an alt describing it would announce the same fact twice — and
				there is nothing else in a cover for a screen reader to have.
			-->
			<img class="media-artwork__cover" src={cover} alt="" />

			{#if open}
				<div class="media-artwork__top">
					<span class="media-artwork__artist" title={artist}>{artist ?? ''}</span>
					<span class="media-artwork__title" {title}>{title}</span>
					{@render fold()}
				</div>

				<!-- The transport at the size a player's controls are rather than the
				     size a chrome row's are. The strip
				     prints that legend already, and the same legend twice on one screen
				     is how a row of controls becomes a row of documentation. -->
				<div class="media-artwork__bottom">
					<div class="media-artwork__controls">
						<MediaTransport {player} />
					</div>
					<MediaAttribution {media} />
				</div>
			{/if}
		</div>

		{#if !open}
			<!-- Title over artist, centred against the thumbnail: the song is what
			     the row is about and the artist qualifies it, which is the opposite
			     of the order the two take on the picture — there they are the two
			     ends of one line and the title sits where the eye finishes. -->
			<div class="media-artwork__meta">
				<span class="media-artwork__title" {title}>{title}</span>
				{#if artist}
					<span class="media-artwork__artist" title={artist}>{artist}</span>
				{/if}
			</div>
			<!-- The way back and the mark, in one column at the far end: the chevron
			     is the row's only control and the mark is the only thing that has to
			     be seen rather than pressed, so neither is competing for the slack
			     between them. -->
			<div class="media-artwork__aside">
				{@render fold()}
				<MediaAttribution {media} />
			</div>
		{/if}
	</div>
{/if}
