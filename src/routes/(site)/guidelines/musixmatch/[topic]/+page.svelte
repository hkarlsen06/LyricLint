<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Check links only append a trailing slash to a resolved route. */
	import { resolve } from '$app/paths';
	import CodeProse from '$lib/ui/site/CodeProse.svelte';
	import SourceLink from '$lib/diagnostics/SourceLink.svelte';
	import { siteUrl } from '$lib/seo.js';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();
	const labels = {
		check: 'Partly checked from text',
		metadata: 'Retained metadata',
		review: 'Needs contextual review',
		workflow: 'Contribution workflow',
		'source-conflict': 'Unresolved source scope',
		advisory: 'Community advice'
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

<main id="main" tabindex="-1" class="site-prose site-split__page">
	<h1>{data.topic.title} for Musixmatch</h1>
	<p class="site-lede">
		Each convention keeps its source, language scope and the part that still needs judgment.
	</p>
	{#each data.entries as entry (entry.id)}
		<section
			id={entry.id.toLowerCase()}
			class="profile-guideline"
			aria-labelledby={`${entry.id}-heading`}
		>
			<h2 id={`${entry.id}-heading`}><CodeProse text={entry.title} /></h2>
			<p class="site-meta">
				{labels[entry.handling]} · {entry.languages.length === 8
					? 'All supported languages where applicable'
					: entry.languages.join(', ')}
			</p>
			<p><CodeProse text={entry.statement} /></p>
			<h3>What LyricLint can establish</h3>
			<p><CodeProse text={entry.limit} /></p>
			{#if entry.checks.length}
				<ul>
					{#each entry.checks as check (check.slug)}
						<li>
							<a href={`${resolve('/(site)/guidelines/checks/[rule]', { rule: check.slug })}/`}
								>{check.title}</a
							>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="site-meta">{entry.topic} · {entry.id}</p>
			<ul class="profile-sources">
				{#each entry.sources as source (source.id)}
					<li><SourceLink {source} /></li>
				{/each}
			</ul>
		</section>
	{/each}
</main>

<style>
	.profile-guideline {
		margin-block: var(--space-7);
		scroll-margin-block-start: var(--space-6);
	}
	.profile-sources {
		padding-inline-start: 0;
		list-style: none;
	}
	.profile-sources li {
		margin-block: var(--space-2);
	}
</style>
