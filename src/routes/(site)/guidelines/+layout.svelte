<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import ReferenceIndex from '#lib/ui/site/ReferenceIndex.svelte';
	import SectionSplit from '#lib/ui/site/SectionSplit.svelte';
	import { resolve } from '$app/paths';
	import GuideWelcome from '#lib/ui/site/GuideWelcome.svelte';
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
	detailOpen={page.params.topic !== undefined || page.params.rule !== undefined}
	checkOpen={page.params.rule !== undefined}
	reveal={() => index?.revealSelected()}
>
	{#snippet intro()}
		{#if musixmatch}
			<section class="site-prose site-split__page">
				<h1>Write lyrics for Musixmatch</h1>
				<p>Keep sung words in the lyrics. Section and performer tags belong outside the text.</p>
				<p>
					Browse the conventions and language exceptions beside their sources. Official Musixmatch
					guidance is authoritative for this format; unresolved source conflicts remain visible.
				</p>
			</section>
		{:else}<GuideWelcome />{/if}
	{/snippet}
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
