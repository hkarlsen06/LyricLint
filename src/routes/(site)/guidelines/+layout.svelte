<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import GuidanceIndex from '$lib/ui/site/GuidanceIndex.svelte';
	import SectionSplit from '$lib/ui/site/SectionSplit.svelte';
	import type { LayoutProps } from './$types.js';

	let { children, data }: LayoutProps = $props();

	const selectedTopic = $derived(page.params.topic);

	let index = $state<GuidanceIndex>();
</script>

<!-- The rule reference's own arrangement, from the same `SectionSplit`: the
     lookups on the left, the open guideline on the right, and the list mounted
     once for the whole section so pressing a row swaps only the column beside
     it — a reader who searched and opened a result comes back to the search
     they were in the middle of. -->
<SectionSplit
	indexHref={resolve('/guidelines/')}
	detailOpen={selectedTopic !== undefined}
	backLabel="All guidelines"
	reveal={() => index?.revealSelected()}
>
	{#snippet list()}
		<GuidanceIndex bind:this={index} sections={data.sections} {selectedTopic} />
	{/snippet}

	{@render children()}
</SectionSplit>
