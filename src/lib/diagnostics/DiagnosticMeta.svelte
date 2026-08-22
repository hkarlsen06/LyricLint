<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import type { Diagnostic, SourceReference } from '$lib/core/types.js';
	import SeverityTag from './SeverityTag.svelte';
	import SourceCitation from './SourceCitation.svelte';
	// The actual mark, raw and inline rather than an `<img>`: its brackets are
	// stroked with `currentColor`, which only an inline SVG can take from the
	// meta line's own text — in an image element they render black in every
	// scheme. Raw rather than redrawn, so the geometry cannot drift from the
	// asset the wordmark has to keep matching.
	import lyricLintMarkRaw from '$lib/assets/lyriclint-mark.svg?raw';

	// Only the label comes off, never the geometry: the words beside the mark
	// already say LyricLint, and an inline `<title>` also draws a native browser
	// tooltip on hover, which an `aria-hidden` wrapper does nothing to stop.
	const lyricLintMark = lyricLintMarkRaw.replace(/<title>[^<]*<\/title>\s*/u, '');

	let {
		diagnostic,
		sources,
		line
	}: {
		diagnostic: Diagnostic;
		/** The panel holds its citations by id, the editor as a list; both work. */
		sources: ReadonlyMap<string, SourceReference> | readonly SourceReference[];
		/**
		 * Where the finding is, when the surface has to say so. The panel's card
		 * does; the editor's popover is already anchored under the underline it
		 * describes, so it passes nothing and the citation follows the severity.
		 */
		line?: number;
	} = $props();

	/** Which of the two shapes the surface handed over. */
	function isSourceList(
		value: ReadonlyMap<string, SourceReference> | readonly SourceReference[]
	): value is readonly SourceReference[] {
		return Array.isArray(value);
	}

	const lookup = $derived(
		isSourceList(sources) ? new Map(sources.map((source) => [source.id, source])) : sources
	);
	const citations = $derived(
		diagnostic.sourceIds.map((sourceId) => ({ id: sourceId, source: lookup.get(sourceId) }))
	);

	// One citation is the line's last word; more than one would wrap the meta line
	// into a second and a third, so they fold behind a disclosure instead and the
	// line keeps its length no matter how many sources a rule cites.
	const folded = $derived(citations.length > 1);
	let expanded = $state(false);
	let previousCitationKey = $state('');

	// A different set of citations is a different audit trail, so it starts
	// folded again. Two diagnostics citing the same sources keep the disclosure
	// the reader already opened.
	$effect(() => {
		const key = diagnostic.sourceIds.join(' ');
		if (key !== previousCitationKey) {
			previousCitationKey = key;
			expanded = false;
		}
	});
</script>

<!--
	Everything the surface knows about the finding besides its message and its
	reasoning, on one line: what kind of problem it is, where it is, and what says
	so. The severity used to be a filled badge on a line of its own and the
	citations a footer at the bottom of the card, which spent two blocks of height
	on facts that read as a single sentence.
-->
<div class="diagnostic-meta">
	<span class="diagnostic-meta__row">
		<!--
			Glyph only, and therefore no interpunct after it: an interpunct separates
			facts of the same kind, and the mark that opens the line is not one of the
			words in the list it introduces. The word itself is redundant here in a way
			it is not on the rule reference — a panel of nine findings printed
			"Suggestion" eight times, in the same blue, down the same column.
		-->
		<SeverityTag severity={diagnostic.severity} labelled={false} />
		{#if line !== undefined}
			<span class="diagnostic-meta__line">Line {line}</span>
		{/if}
		{#if diagnostic.derivation}
			{#if line !== undefined}
				<span class="diagnostic-meta__separator" aria-hidden="true">·</span>
			{/if}
			<!--
				The check is LyricLint's own reading of the sources cited after it, and
				the card is the one surface where that fact was carried by the
				explanation's prose alone. The mark is `lyriclint-mark.svg` itself, and
				the words beside it are what a screen reader gets, so the mark stays
				decorative. The `@html` is our own committed asset, not anything
				user-supplied, and the wrapper hides the SVG's own `LyricLint` label
				from assistive technology.
			-->
			<span class="diagnostic-meta__derivation">
				<span class="diagnostic-meta__derivation-mark" aria-hidden="true">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- lyricLintMark is a local constant, not user content. -->
					{@html lyricLintMark}
				</span>
				LyricLint reading
			</span>
		{/if}
		{#if folded}
			{#if line !== undefined || diagnostic.derivation}
				<span class="diagnostic-meta__separator" aria-hidden="true">·</span>
			{/if}
			<button
				type="button"
				class="button button--quiet diagnostic-meta__disclosure"
				aria-expanded={expanded}
				onclick={() => {
					expanded = !expanded;
				}}
			>
				<!-- The label names what is behind it and stays put; the chevron and
				     `aria-expanded` are what carry the open state, so the control does
				     not rewrite itself under the pointer that just pressed it. -->
				Sources
				<ChevronDown
					class="diagnostic-meta__chevron"
					aria-hidden="true"
					size={11}
					strokeWidth={2.4}
				/>
			</button>
		{:else}
			{#each citations as citation, index (citation.id)}
				{#if line !== undefined || diagnostic.derivation || index > 0}
					<span class="diagnostic-meta__separator" aria-hidden="true">·</span>
				{/if}
				{#if citation.source}
					<SourceCitation source={citation.source} />
				{:else}
					<span class="diagnostic-meta__missing">Source unavailable: {citation.id}</span>
				{/if}
			{/each}
		{/if}
	</span>

	{#if folded && expanded}
		<!-- A plain list, no box and no rules around it: the citations read the
		     same unfolded as the single one does inline, tooltip included. -->
		<ul class="diagnostic-meta__sources" aria-label="Sources">
			{#each citations as citation (citation.id)}
				<li>
					{#if citation.source}
						<SourceCitation source={citation.source} />
					{:else}
						<span class="diagnostic-meta__missing">Source unavailable: {citation.id}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
