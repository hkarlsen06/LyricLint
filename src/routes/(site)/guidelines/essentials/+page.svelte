<script lang="ts">
	import { resolve } from '$app/paths';
	import { guidanceEntries } from '#lib/guidance/entries.js';
	import { essentialEntryIds, essentialCompanions } from '#lib/guidance/essentials.js';
	import { referenceTopics } from '#lib/reference/topics.js';
	import { entryAnchor } from '#lib/guidance/guidance.js';
	import { referenceHref } from '#lib/ui/site/reference-search.svelte.js';
	import { siteUrl } from '#lib/seo.js';
	import GuidanceConvention from '#lib/ui/site/GuidanceConvention.svelte';
	import StructuredData from '#lib/ui/site/StructuredData.svelte';
	const entries = essentialEntryIds.flatMap((id) =>
		guidanceEntries.filter((entry) => entry.id === id)
	);
	const title = 'Genius transcription essentials · LyricLint';
	const description = `${entries.length} practical starting points for Genius lyric transcription, with reviewed examples, qualifications, and links to the complete topics.`;
	const canonical = siteUrl('/guidelines/essentials/');
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
</svelte:head>
<StructuredData
	data={{
		'@context': 'https://schema.org',
		'@type': 'TechArticle',
		headline: title,
		description,
		url: canonical,
		about: 'Genius lyric formatting'
	}}
/>
<main id="main" tabindex="-1" class="site-prose site-split__page">
	<h1>Genius transcription essentials</h1>
	<p class="site-lede">
		{entries.length} practical starting points when you are new to transcribing.
	</p>
	<p>
		Use this optional reference for common decisions. It is a selection from the reviewed Genius
		guide, and each complete topic covers more situations and exceptions.
	</p>
	<nav aria-label="On this page">
		<ul>
			{#each entries as entry (entry.id)}<li>
					<a href={`#${entryAnchor(entry.id)}`}>{entry.title}</a>
				</li>{/each}
		</ul>
	</nav>
	{#each entries as entry (entry.id)}
		<section>
			<h2 id={entryAnchor(entry.id)}>{entry.title}</h2>
			<GuidanceConvention {entry} />
			{#each guidanceEntries.filter((candidate) => essentialCompanions
					.get(entry.id)
					?.includes(candidate.id)) as companion (companion.id)}
				<h3 id={entryAnchor(companion.id)}>{companion.title}</h3>
				<GuidanceConvention entry={companion} />
			{/each}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- referenceHref preserves search on a resolved topic URL. -->
			<p>
				<a
					href={referenceHref(
						`${resolve('/(site)/guidelines/[topic]', { topic: entry.topic })}/#${entryAnchor(entry.id)}`
					)}>More in {referenceTopics.find((topic) => topic.id === entry.topic)?.title}</a
				>
			</p>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</section>
	{/each}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- referenceHref preserves search on the resolved URL. -->
	<p>
		<a href={referenceHref(resolve('guidelines/all/'))}
			>Read the complete Genius transcription guide</a
		>
	</p>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</main>

<style>
	section {
		border-top: var(--border-width) solid var(--color-border);
		margin-top: var(--space-7);
		padding-top: var(--space-6);
	}
	section > h2 {
		margin-top: 0;
	}
	h2,
	h3 {
		scroll-margin-top: calc(var(--header-height) + var(--space-6));
	}
	nav li + li {
		margin-top: var(--space-2);
	}
</style>
