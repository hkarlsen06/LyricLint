<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import MusixmatchClause from '#lib/ui/site/MusixmatchClause.svelte';
	import { siteUrl } from '#lib/seo.js';
	import type { PageProps, Snapshot } from './$types.js';

	let { data }: PageProps = $props();
	let article: HTMLElement;
	// The same restoration as a Genius topic: open checks, then the window once they have laid out.
	export const snapshot: Snapshot<{ checks: number[]; windowY: number }> = {
		capture: () => ({
			checks: Array.from(
				article.querySelectorAll<HTMLDetailsElement>('details[data-check-id]')
			).flatMap((element, index) => (element.open ? [index] : [])),
			windowY: window.scrollY
		}),
		restore: (saved) => {
			const restoredUrl = location.href;
			article
				.querySelectorAll<HTMLDetailsElement>('details[data-check-id]')
				.forEach((element, index) => {
					element.open = saved.checks.includes(index);
				});
			void tick().then(() =>
				requestAnimationFrame(() =>
					requestAnimationFrame(() => {
						if (location.href === restoredUrl && article.isConnected)
							window.scrollTo(0, saved.windowY);
					})
				)
			);
		}
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

<main id="main" tabindex="-1" class="site-prose site-split__page" bind:this={article}>
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
		<a class="button" href={resolve('/(app)/workbench')}>Check a transcription in the workbench</a>
	</div>
</main>
