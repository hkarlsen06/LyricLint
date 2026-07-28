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

	/**
	 * A credit string cut into its names and the separators between them,
	 * alternating: even indices are names, odd ones are the punctuation that stood
	 * between them.
	 *
	 * **Joining the array back up returns the string byte for byte**, which is what
	 * keeps this from being the rewrite `SongDetails.writers` refuses. The row still
	 * reads exactly as the catalogue gave it — `Petter Bjørklund Kristiansen,
	 * Kristofer Strandberg, Thor-Erik Claussen & Andreas Werling` — and all that has
	 * changed is where one press lands.
	 *
	 * That is also the whole of the safety argument for splitting at all. A credit
	 * this cuts in the wrong place (`Smith, Jr.` is the one to worry about) costs a
	 * press that copies half a name, in front of a reader who can see the boundary
	 * because the half they hovered is the half that underlines — where a *list*
	 * built on the same guess would state a writer that does not exist.
	 */
	export function creditSegments(credit: string): string[] {
		return credit.split(/(\s*(?:[,;&]|\/)\s*)/);
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
	 * **Every value is a press, and a writers row is one press per name.** The list
	 * exists to be retyped into another page's fields, and that page takes one
	 * writer at a time — so a reader who has to select four names out of one line by
	 * hand, four times, has been handed the facts and none of the work. Selecting
	 * a name with a pointer is also the one gesture this list was worst at: the
	 * boundaries are commas in a wrapped line.
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
	import { copyText } from '../clipboard.js';

	let { details, genius = false }: { details: SongDetails; genius?: boolean } = $props();

	/**
	 * Which press landed, and what it took.
	 *
	 * The confirmation is the copied name in the success color, and nothing else is
	 * drawn. A mark beside it says the same thing a second time in a list where the
	 * user has just pressed the thing they are looking at — and the only place to
	 * put one that does not reflow the line under that press is a slot every row
	 * reserves for it, which is a permanent indent on six rows for a state that is
	 * showing on none of them. The announcement is what carries it for a reader with
	 * no pointer.
	 */
	let copiedKey = $state<string | undefined>();
	let announcement = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => () => clearTimeout(timer));

	async function copy(key: string, value: string) {
		try {
			await copyText(value);
		} catch {
			// The clipboard refusing is the one state that says nothing: a mark
			// claiming a copy that never landed is worse than no mark at all.
			return;
		}
		copiedKey = key;
		announcement = `${value} copied`;
		clearTimeout(timer);
		timer = setTimeout(() => {
			copiedKey = undefined;
			announcement = '';
		}, 2000);
	}
</script>

<!--
	`term` and the segment's index key the press, so the copied color lands on the
	one name that was taken. `credit` is the only kind of value cut up, because it is
	the only one that is a list; an artist named `Bob Marley & The Wailers` is one
	entity and splitting it would offer half a band.

	**A name, the comma after it and the next name have to meet with nothing between
	them**, and the thing that would put something there is this file's own
	indentation: a newline between two inline elements is a text node that renders
	as a space, and `Kristiansen , Kristofer` is the version of this row that has
	gone wrong. Two things stop it, and only the second is ours to keep. The
	compiler trims whitespace at the edges of a block, which is what every piece
	here sits inside; and `.metadata-list dd` is a flex row, where a whitespace-only
	anonymous item is not rendered at all — so a piece moved out of its block later
	cannot reintroduce the gap. `SongFacts.svelte.test.ts` measures the pieces
	meeting rather than trusting either.
-->
{#snippet fact(term: string, value: string, options?: { datetime?: string; credit?: boolean })}
	<div>
		<dt>{term}</dt>
		<dd>
			{#each options?.credit ? creditSegments(value) : [value] as segment, index (index)}
				{#if index % 2 === 1}
					<span class="metadata-copy__separator">{segment}</span>
				{:else if segment !== ''}
					<button
						type="button"
						class="metadata-copy"
						class:is-copied={copiedKey === `${term}#${index}`}
						aria-label="Copy {segment}"
						title="Copy"
						onclick={() => copy(`${term}#${index}`, segment)}
					>
						{#if options?.datetime}
							<time datetime={options.datetime}>{segment}</time>
						{:else}
							{segment}
						{/if}
					</button>
				{/if}
			{/each}
		</dd>
	</div>
{/snippet}

<dl class="metadata-list">
	{#if genius && details.artist}
		{@render fact('Artist', details.artist)}
	{/if}
	{#if genius && details.title}
		{@render fact('Title', details.title)}
	{/if}
	{#if details.releaseDate}
		{@render fact('Released', details.releaseDate, { datetime: details.releaseDate })}
	{/if}
	{#if details.writers}
		{@render fact('Writers', details.writers, { credit: true })}
	{/if}
	{#if details.album}
		{@render fact('Album', details.album)}
	{/if}
	{#if details.label}
		{@render fact('Label', details.label)}
	{/if}
	{#if !genius && details.isrc}
		{@render fact('ISRC', details.isrc)}
	{/if}
</dl>

<!-- Inside the list rather than fed to the shell's own region: the receipt is a
     modal, and a live region outside it is not reliably announced from within. -->
<span class="sr-only" aria-live="polite">{announcement}</span>
