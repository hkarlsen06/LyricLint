<script module lang="ts">
	import type { SongDetails } from '../state/media-player.svelte.js';

	/**
	 * Whether any of the facts *this list draws* are known.
	 *
	 * `songDetails` existing is not the same question: a source that reports only an
	 * artist and a title would otherwise open an empty `<dl>` under a heading — and
	 * under `genius`, a song known only by its ISRC would open one the same way.
	 */
	export function hasSongFacts(details: SongDetails | undefined, genius = false): boolean {
		if (details === undefined) return false;
		const facts = [details.releaseDate, details.writers, details.album, details.label];
		facts.push(...(genius ? [details.artist, details.title] : [details.isrc]));
		return facts.some((fact) => fact !== undefined);
	}
</script>

<script lang="ts">
	/**
	 * The attached song's facts, in the forms somebody filling in a song page
	 * elsewhere has to paste — one implementation, because the tools panel and the
	 * copy receipt are the same list seen from two places.
	 *
	 * A `<dl>` rather than a copied block: these go into separate fields, so one
	 * string holding all of them would only have to be taken apart again by hand.
	 * The grid is on the list and each row is `display: contents`, so a value that
	 * wraps stays in its own column (`.metadata-list` in `tools.css`).
	 *
	 * `genius` is the list Genius's own song form asks for rather than everything
	 * known, which is what the two surfaces differ by. It adds the artist and the
	 * title — the tools panel leaves those to the toolbar and the cover band, which
	 * the receipt covers up — and drops the ISRC, which that form has no field for.
	 * A fact nobody is going to type in is a row between the reader and the ones
	 * they are.
	 *
	 * Only Apple Music fills the whole of it. What is absent is deliberate rather
	 * than missing — Apple's catalogue has no producer credits at all, and their
	 * one writer field is `composerName`, a flat string this application does not
	 * try to split.
	 */
	let { details, genius = false }: { details: SongDetails; genius?: boolean } = $props();
</script>

<dl class="metadata-list">
	{#if genius && details.artist}
		<div>
			<dt>Artist</dt>
			<dd>{details.artist}</dd>
		</div>
	{/if}
	{#if genius && details.title}
		<div>
			<dt>Title</dt>
			<dd>{details.title}</dd>
		</div>
	{/if}
	{#if details.releaseDate}
		<div>
			<dt>Released</dt>
			<dd><time datetime={details.releaseDate}>{details.releaseDate}</time></dd>
		</div>
	{/if}
	{#if details.writers}
		<div>
			<dt>Writers</dt>
			<dd>{details.writers}</dd>
		</div>
	{/if}
	{#if details.album}
		<div>
			<dt>Album</dt>
			<dd>{details.album}</dd>
		</div>
	{/if}
	{#if details.label}
		<div>
			<dt>Label</dt>
			<dd>{details.label}</dd>
		</div>
	{/if}
	{#if !genius && details.isrc}
		<div>
			<dt>ISRC</dt>
			<dd>{details.isrc}</dd>
		</div>
	{/if}
</dl>
