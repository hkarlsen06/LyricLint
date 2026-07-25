<script lang="ts">
	import type { Diagnostic, SourceReference } from '$lib/core/types.js';
	import SeverityTag from './SeverityTag.svelte';
	import SourceCitation from './SourceCitation.svelte';

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

	const lookup = $derived(
		sources instanceof Map
			? (sources as ReadonlyMap<string, SourceReference>)
			: new Map((sources as readonly SourceReference[]).map((source) => [source.id, source]))
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
		<SeverityTag severity={diagnostic.severity} />
		{#if line !== undefined}
			<span class="diagnostic-meta__separator" aria-hidden="true">·</span>
			<span class="diagnostic-meta__line">Line {line}</span>
		{/if}
		{#if folded}
			<span class="diagnostic-meta__separator" aria-hidden="true">·</span>
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
				<svg
					class="diagnostic-meta__chevron"
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="11"
					height="11"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="m4 6.5 4 4 4-4" />
				</svg>
			</button>
		{:else}
			{#each citations as citation (citation.id)}
				<span class="diagnostic-meta__separator" aria-hidden="true">·</span>
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
