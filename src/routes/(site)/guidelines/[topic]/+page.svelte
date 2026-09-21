<script lang="ts">
	import { guidanceTopics } from '$lib/guidance/entries.js';
	import { guidanceTopicLandmarks, guidanceTopicTitles } from '$lib/guidance/guidance.js';
	import { getSource } from '$lib/rules/data/sources.js';
	import { referenceTopics } from '$lib/reference/topics.js';
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

	const topic = $derived(data.topic);
	const topicTitle = $derived(
		referenceTopics.find((item) => item.id === topic)?.title ?? guidanceTopicTitles[topic]
	);
	const entries = $derived(
		guidanceTopics().find((candidate) => candidate.topic === topic)!.entries
	);

	/**
	 * The unique sources this page cites, for the structured data: the
	 * landmarks' as well as the entries', because a landmark states its
	 * standing on the page and a citation drawn there but missing here would
	 * describe the page as resting on less than it does.
	 */
	const sources = $derived(
		[
			...new Set([
				...entries.flatMap((entry) => entry.sourceIds),
				...(guidanceTopicLandmarks[topic] ?? []).flatMap((landmark) => landmark.sourceIds)
			])
		].flatMap((id) => {
			const source = getSource(id);
			return source ? [source] : [];
		})
	);

	// Title case for the section's own name, exactly as the index page's tab
	// carries it: a tab is a label, not a sentence. The topic's title leads,
	// because a tab shows its first few characters and the topic is what tells
	// two of these apart.
	const pageTitle = $derived(`${topicTitle} · Transcription guide · LyricLint`);
	const pageDescription = $derived(
		`Genius transcription conventions for ${topicTitle.toLowerCase()}: ${entries
			.map((entry) => entry.title.toLowerCase())
			.join(', ')}.`
	);
	const canonicalUrl = $derived(siteUrl(`/guidelines/${topic}/`));

	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'TechArticle',
		headline: `${topicTitle} · Transcription guide`,
		url: canonicalUrl,
		mainEntityOfPage: canonicalUrl,
		description: pageDescription,
		author: {
			'@type': 'Organization',
			name: 'LyricLint'
		},
		about: 'Genius lyric formatting',
		citation: sources.map((source) => source.url)
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={canonicalUrl} />
</svelte:head>

<StructuredData data={structuredData} />

<GuideArticle {data} {topic} bind:this={article} />
