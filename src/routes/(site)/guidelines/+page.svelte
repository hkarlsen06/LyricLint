<script lang="ts">
	import { resolve } from '$app/paths';
	import { countGuidanceLookups } from '$lib/guidance/guidance-search.js';
	import { guidanceTopicTitles } from '$lib/guidance/guidance.js';
	import { siteUrl } from '$lib/seo.js';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	/**
	 * The detail column at `/guidelines/` says what the catalog is, the rule
	 * reference's own arrangement: the finder and every convention are in the column
	 * beside this one, so the page's job is the part a list cannot carry — where
	 * the conventions come from and how much standing each tier has.
	 */
	const total = $derived(countGuidanceLookups(data.sections));

	// Title case, because a tab is a label rather than a sentence: `Genius
	// transcription guidelines · LyricLint` read as the middle of a sentence
	// somebody had cut in half, next to a row of tabs that are all names.
	const pageTitle = 'Genius Transcription Guidelines · LyricLint';
	const pageDescription = $derived(
		`Reviewed Genius transcription conventions in one place — ${total} of them, each with its source: the guidance the linter cannot check for you, and the rules it enforces itself.`
	);
	const canonicalUrl = siteUrl('/guidelines/');
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: 'Genius Transcription Guidelines',
		url: canonicalUrl,
		description: pageDescription,
		numberOfItems: total,
		hasPart: data.sections.map(({ topic }) => ({
			'@type': 'TechArticle',
			headline: guidanceTopicTitles[topic],
			url: siteUrl(`/guidelines/${topic}/`)
		}))
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={canonicalUrl} />
</svelte:head>

<StructuredData data={structuredData} />

<main class="site-prose site-split__page">
	<h1>Genius Transcription Guidelines</h1>
	<p class="site-lede">
		Every guideline we have found for writing lyrics on Genius, compiled from staff guides, accepted
		annotations, and staff rulings. The ones the workbench's
		<a href={resolve('/rules/')}>linter</a> checks itself open its rule reference; the rest are stated
		here with the source behind them.
	</p>
	<p>
		Every entry says how much standing it has: staff guidance ranks highest, then editor-reviewed
		annotations, then outside references, then unreviewed community writing. An entry claims only
		the tier its sources establish.
	</p>

	<h2>The topics so far</h2>
	<p>Every convention is in the list beside this page; each topic also reads whole:</p>
	<ul class="site-run">
		{#each data.sections as { topic, entries, linterRules } (topic)}
			<li>
				<a href="{resolve('/(site)/guidelines/[topic]', { topic })}/">
					<span class="site-run__title">{guidanceTopicTitles[topic]}</span>
					<span class="site-run__message">
						{entries.length}
						{entries.length === 1 ? 'guideline' : 'guidelines'} · {linterRules.length} linter
						{linterRules.length === 1 ? 'rule' : 'rules'}
					</span>
				</a>
			</li>
		{/each}
	</ul>

	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
</main>
