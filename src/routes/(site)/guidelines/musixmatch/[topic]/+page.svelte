<script lang="ts">
	import { resolve } from '$app/paths';
	import MusixmatchClause from '#lib/ui/site/MusixmatchClause.svelte';
	import { siteUrl } from '#lib/seo.js';
	import MusixmatchSearchResults, {
		type MusixmatchReadingSnapshot
	} from '#lib/ui/site/MusixmatchSearchResults.svelte';
	import { referenceSearchQuery } from '#lib/ui/site/reference-search.svelte.js';
	import type { Snapshot } from '@sveltejs/kit';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();
	let results = $state<MusixmatchSearchResults>();
	export const snapshot: Snapshot<MusixmatchReadingSnapshot> = {
		capture: () => results?.snapshot.capture() ?? { checks: [], detailY: 0 },
		restore: (saved) => results?.snapshot.restore(saved)
	};
</script>

<svelte:head>
	<title>{data.topic.title} · Musixmatch · LyricLint</title>
	<meta
		name="description"
		content={`Musixmatch guidance for ${data.topic.title.toLowerCase()}, with sources and the limits of deterministic checking.`}
	/>
	<link rel="canonical" href={siteUrl(`/guidelines/musixmatch/${data.topic.id}/`)} />
</svelte:head>

{#if referenceSearchQuery().trim()}
	<MusixmatchSearchResults {data} bind:this={results} />
{:else}
	<main id="main" tabindex="-1" class="site-prose site-split__page">
		<h1>{data.topic.title} for Musixmatch</h1>
		<p class="site-lede">
			Each convention keeps its source, language scope and the part that still needs judgment.
		</p>
		<p class="site-meta">
			{data.entryCount} conventions · {data.checkCount} related
			{data.checkCount === 1 ? 'check' : 'checks'}
		</p>
		<p>
			The checks below catch specific patterns in your text. They support your review; passing them
			does not verify every part of a convention.
		</p>
		{#each data.entries as entry (entry.id)}
			<MusixmatchClause {entry} />
		{/each}
		<div class="site-actions">
			<a class="button" href={resolve('/(app)/workbench')}>Check a transcription in the workbench</a
			>
		</div>
	</main>
{/if}
