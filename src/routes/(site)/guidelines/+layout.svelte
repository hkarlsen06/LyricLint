<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import ReferenceIndex from '$lib/ui/site/ReferenceIndex.svelte';
	import SectionSplit from '$lib/ui/site/SectionSplit.svelte';
	import { referenceHref } from '$lib/ui/site/reference-search.svelte.js';
	import type { LayoutProps } from './$types.js';
	let { children, data }: LayoutProps = $props();
	let index = $state<ReferenceIndex>();
	const musixmatch = $derived(
		page.url.pathname.includes('/guidelines/musixmatch/') ||
			page.params.rule?.startsWith('mxm-') === true
	);
	$effect(() => {
		if (page.url.searchParams.get('profile') === 'musixmatch' && !musixmatch && !page.params.rule) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- Preserve query state on the resolved Musixmatch route.
			void goto(`${resolve('/(site)/guidelines/musixmatch')}/${page.url.search}`, {
				replaceState: true
			});
		}
	});
</script>

<SectionSplit
	indexHref={referenceHref(
		musixmatch ? `${resolve('/(site)/guidelines/musixmatch')}/` : resolve('/guidelines/')
	)}
	detailOpen={page.params.topic !== undefined || page.params.rule !== undefined}
	backLabel="Back to guide"
	section="guidelines"
	reveal={() => index?.revealSelected()}
>
	{#snippet list()}
		<ReferenceIndex
			bind:this={index}
			corpus={musixmatch ? data.musixmatchCorpus : data.referenceCorpus}
			profile={musixmatch ? 'musixmatch' : 'genius'}
			showProfileNavigation
			selectedSlug={page.params.rule}
			selectedTopic={page.params.topic}
		/>
	{/snippet}
	{@render children()}
</SectionSplit>
