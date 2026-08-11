<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import RuleIndex from '$lib/ui/site/RuleIndex.svelte';
	import SectionSplit from '$lib/ui/site/SectionSplit.svelte';
	import type { LayoutProps } from './$types.js';

	let { children, data }: LayoutProps = $props();

	// Derived once by the prerenderer and handed here as data — see
	// `+layout.server.ts` for why deriving it in this file was a bug rather than
	// a shortcut. It lives in the layout rather than in the index page so it is
	// mounted once for the whole section: pressing a row swaps the column beside
	// the list instead of tearing the list down and building it again, and since
	// `RuleIndex` holds the search and the chips, a reader who filtered the list
	// and opened one of the results comes back to the filter they were using.
	const groups = $derived(data.groups);

	const selectedSlug = $derived(page.params.rule);

	let index = $state<RuleIndex>();
</script>

<SectionSplit
	indexHref={resolve('/rules/')}
	detailOpen={selectedSlug !== undefined}
	backLabel="All rules"
	reveal={() => index?.revealSelected()}
>
	{#snippet list()}
		<RuleIndex bind:this={index} {groups} {selectedSlug} />
	{/snippet}

	{@render children()}
</SectionSplit>
