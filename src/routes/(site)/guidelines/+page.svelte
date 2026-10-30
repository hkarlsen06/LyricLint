<script lang="ts">
	import { guidanceTopicTitles } from '#lib/guidance/guidance.js';
	import { siteUrl } from '#lib/seo.js';
	import StructuredData from '#lib/ui/site/StructuredData.svelte';
	import GuideWelcome from '#lib/ui/site/GuideWelcome.svelte';
	import type { PageProps, Snapshot } from './$types.js';

	let { data }: PageProps = $props();
	export const snapshot: Snapshot<{ finderY: number; windowY: number; openChecks: number[] }> = {
		capture: () => ({
			finderY: document.querySelector('.guide-sidebar')?.scrollTop ?? 0,
			windowY: window.scrollY,
			openChecks: Array.from(
				document.querySelectorAll<HTMLDetailsElement>('.reference-results details')
			).flatMap((item, index) => (item.open ? [index] : []))
		}),
		restore: (saved) => {
			const restoredUrl = location.href;
			requestAnimationFrame(() => {
				const checks = document.querySelectorAll<HTMLDetailsElement>('.reference-results details');
				checks.forEach((item, index) => (item.open = saved.openChecks.includes(index)));
				requestAnimationFrame(() => {
					if (location.href !== restoredUrl) return;
					const finder = document.querySelector('.guide-sidebar');
					if (finder) finder.scrollTop = saved.finderY;
					window.scrollTo(0, saved.windowY);
				});
			});
		}
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

<GuideWelcome spellings={data.spellings} />
