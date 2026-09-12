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
	import { copyText } from '../clipboard.js';
	import { NOTICE_TOAST_DURATION } from '../state/feedback.svelte.js';
	import type { FeedbackState } from '../state/feedback.svelte.js';

	let {
		details,
		genius = false,
		feedback
	}: { details: SongDetails; genius?: boolean; feedback: FeedbackState } = $props();

	// Each value copies independently; feedback must leave its text and position intact.
	let copiedKey = $state<string | undefined>();
	let announcement = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let copyAttempt = 0;

	$effect(() => () => {
		copyAttempt += 1;
		clearTimeout(timer);
	});

	async function copy(key: string, value: string) {
		const attempt = ++copyAttempt;
		clearTimeout(timer);
		copiedKey = undefined;
		announcement = '';
		try {
			await copyText(value);
		} catch {
			if (attempt !== copyAttempt) return;
			const message = 'Copy failed. Check browser clipboard permission and try again.';
			feedback.announce(message);
			feedback.addToast({ message, duration: NOTICE_TOAST_DURATION });
			return;
		}
		if (attempt !== copyAttempt) return;
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
	`term` and the segment's index key the press, so the copied cue lands on the
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

<!-- Success stays beside the facts; refusals use the shared visible and live feedback. -->
<span class="sr-only" aria-live="polite">{announcement}</span>
