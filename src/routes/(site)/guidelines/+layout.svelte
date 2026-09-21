<script lang="ts">
	import { page } from '$app/state';
	import ReferenceIndex from '$lib/ui/site/ReferenceIndex.svelte';
	import SectionSplit from '$lib/ui/site/SectionSplit.svelte';
	import GuideWelcome from '$lib/ui/site/GuideWelcome.svelte';
	import type { LayoutProps } from './$types.js';
	let { children, data }: LayoutProps = $props();
	let index = $state<ReferenceIndex>();
</script>

<SectionSplit
	detailOpen={page.params.topic !== undefined || page.params.rule !== undefined}
	checkOpen={page.params.rule !== undefined}
	reveal={() => index?.revealSelected()}
>
	{#snippet intro()}<GuideWelcome />{/snippet}
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
