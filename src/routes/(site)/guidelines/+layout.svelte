<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ReferenceIndex from '$lib/ui/site/ReferenceIndex.svelte';
	import SectionSplit from '$lib/ui/site/SectionSplit.svelte';
	import { referenceHref } from '$lib/ui/site/reference-search.svelte.js';
	import type { LayoutProps } from './$types.js';
	let { children, data }: LayoutProps = $props();
	let index = $state<ReferenceIndex>();
</script>

<SectionSplit
	indexHref={referenceHref(resolve('/guidelines/'))}
	detailOpen={page.params.topic !== undefined || page.params.rule !== undefined}
	backLabel="Back to guide"
	section="guidelines"
	reveal={() => index?.revealSelected()}
>
	{#snippet list()}
		<ReferenceIndex
			bind:this={index}
			corpus={data.referenceCorpus}
			selectedSlug={page.params.rule}
			selectedTopic={page.params.topic}
		/>
	{/snippet}
	{@render children()}
</SectionSplit>
