<script lang="ts">
	import type { SourceReference } from '$lib/core/types.js';
	import SourceLink from './SourceLink.svelte';

	const SOURCE_PREVIEW_LIMIT = 2;
	const SOURCE_COLLAPSE_THRESHOLD = 3;

	let {
		sourceIds,
		sources
	}: {
		sourceIds: readonly string[];
		/** The panel holds its citations by id, the editor as a list; both work. */
		sources: ReadonlyMap<string, SourceReference> | readonly SourceReference[];
	} = $props();

	let expanded = $state(false);
	let previousCitationKey = $state('');

	const lookup = $derived(
		sources instanceof Map
			? (sources as ReadonlyMap<string, SourceReference>)
			: new Map((sources as readonly SourceReference[]).map((source) => [source.id, source]))
	);
	const citations = $derived(
		sourceIds.map((sourceId) => ({ id: sourceId, source: lookup.get(sourceId) }))
	);
	const visibleCitations = $derived(
		expanded || citations.length <= SOURCE_COLLAPSE_THRESHOLD
			? citations
			: citations.slice(0, SOURCE_PREVIEW_LIMIT)
	);
	const hiddenCount = $derived(
		citations.length > SOURCE_COLLAPSE_THRESHOLD ? citations.length - SOURCE_PREVIEW_LIMIT : 0
	);

	// A different set of citations is a different audit trail, so it starts
	// collapsed again. Two diagnostics citing the same sources keep the
	// disclosure the reader already opened.
	$effect(() => {
		const key = sourceIds.join(' ');
		if (key !== previousCitationKey) {
			previousCitationKey = key;
			expanded = false;
		}
	});
</script>

{#if citations.length > 0}
	<ul class="diagnostic-sources" aria-label="Sources">
		{#each visibleCitations as citation (citation.id)}
			<li>
				{#if citation.source}
					<SourceLink source={citation.source} />
				{:else}
					<span class="diagnostic-sources__missing">
						Source metadata unavailable: {citation.id}
					</span>
				{/if}
			</li>
		{/each}
		{#if hiddenCount > 0}
			<li class="source-disclosure">
				<button
					type="button"
					class="button button--quiet diagnostic-sources__toggle"
					aria-expanded={expanded}
					onclick={() => {
						expanded = !expanded;
					}}
				>
					{expanded ? 'Show fewer sources' : `Show ${hiddenCount} more sources`}
				</button>
			</li>
		{/if}
	</ul>
{/if}
