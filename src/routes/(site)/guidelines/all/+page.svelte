<script lang="ts">
	import { siteUrl } from '#lib/seo.js';
	import GuideArticle, { type GuideReadingSnapshot } from '#lib/ui/site/GuideArticle.svelte';
	import StructuredData from '#lib/ui/site/StructuredData.svelte';
	import type { PageProps, Snapshot } from './$types.js';
	let { data }: PageProps = $props();
	let article: ReturnType<typeof GuideArticle>;
	export const snapshot: Snapshot<GuideReadingSnapshot> = {
		capture: () => article.snapshot.capture(),
		restore: (saved) => article.snapshot.restore(saved)
	};
	const title = 'Complete Genius transcription guide · LyricLint';
	const description =
		'Read every reviewed Genius transcription convention, with exact examples, exceptions, sources, and the limits of automated checks.';
	const canonical = siteUrl('/guidelines/all/');
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
<GuideArticle {data} bind:this={article} />
