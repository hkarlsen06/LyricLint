<script lang="ts">
	import { guidanceTopicTitles } from '$lib/guidance/guidance.js';
	import { siteUrl } from '$lib/seo.js';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import GuideArticle, { type GuideReadingSnapshot } from '$lib/ui/site/GuideArticle.svelte';
	import type { PageProps, Snapshot } from './$types.js';

	let { data }: PageProps = $props();
	let article: ReturnType<typeof GuideArticle>;
	export const snapshot: Snapshot<GuideReadingSnapshot> = {
		capture: () => article.snapshot.capture(),
		restore: (saved) => article.snapshot.restore(saved)
	};

	const total = $derived(data.guidanceCount);

	const pageTitle = 'Transcription guide · LyricLint';
	const pageDescription = $derived(
		`Write Genius lyrics with ${total} reviewed conventions, practical examples, and explanations of what LyricLint checks.`
	);
	const canonicalUrl = siteUrl('/guidelines/');
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: 'Transcription guide',
		url: canonicalUrl,
		description: pageDescription,
		numberOfItems: total,
		hasPart: data.guidanceTopics.map((topic) => ({
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
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
</svelte:head>

<StructuredData data={structuredData} />

<GuideArticle {data} bind:this={article} />
