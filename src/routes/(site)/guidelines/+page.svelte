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
	 * reference's own arrangement: the finder and every lookup are in the column
	 * beside this one, so the page's job is the part a list cannot carry — where
	 * the conventions come from and how much standing each tier has.
	 */
	const total = $derived(countGuidanceLookups(data.sections));

	const pageTitle = 'Genius transcription guidelines · LyricLint';
	const pageDescription = $derived(
		`Reviewed Genius transcription conventions in one place — ${total} sourced lookups: the guidance the linter cannot check for you, and the rules it enforces itself.`
	);
	const canonicalUrl = siteUrl('/guidelines/');
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: 'Genius transcription guidelines',
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
	<h1>Genius transcription guidelines</h1>
	<p class="site-lede">
		The conventions a Genius transcription follows, compiled from the staff guides, the accepted
		annotations on them, and staff rulings in community discussions. Some of them the
		<a href={resolve('/rules/')}>linter</a> enforces itself, and those open its rule reference; the rest
		— whether a sung line is a question, whether a mark belongs to a brand's name — are stated in LyricLint's
		own words, with the source behind them.
	</p>
	<p>
		Every entry says how much standing it has, and the standing follows who wrote it on Genius
		rather than where. Staff guidance ranks highest, whether written in a guide or ruled in a
		discussion; then annotations reviewed by Genius's community editors; then references outside
		Genius; and unreviewed community writing — annotations and forum posts alike — ranks lowest. An
		entry only ever claims the tier its cited sources establish, and it moves up when a
		higher-ranked source confirms it.
	</p>

	<h2>The topics so far</h2>
	<p>
		Every lookup is in the list beside this page; each topic also reads whole, with its guidance
		spelled out and its examples:
	</p>
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
