<script lang="ts">
	import { resolve } from '$app/paths';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import SourceLink from '$lib/diagnostics/SourceLink.svelte';
	import { currentRuleSet } from '$lib/rules/index.js';
	import { siteUrl } from '$lib/seo.js';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	const reference = $derived(data.reference);
	const pageTitle = $derived(`${reference.message} · LyricLint`);
	const canonicalUrl = $derived(siteUrl(`/rules/${reference.slug}/`));
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'TechArticle',
		headline: reference.message,
		url: canonicalUrl,
		mainEntityOfPage: canonicalUrl,
		description: reference.seoDescription,
		datePublished: currentRuleSet.publishedAt,
		dateModified: currentRuleSet.publishedAt,
		author: {
			'@type': 'Organization',
			name: 'LyricLint'
		},
		about: 'Genius lyric formatting',
		citation: reference.sources.map((source) => source.url)
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={reference.seoDescription} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={reference.seoDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="article:published_time" content={currentRuleSet.publishedAt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={reference.seoDescription} />
</svelte:head>

<StructuredData data={structuredData} />

<main class="site-prose rules__page">
	<h1>{reference.message}</h1>

	<!-- The diagnostic's facts in the diagnostic's idiom: one meta line under the
	     message. The line number a card would carry is meaningless here, so its
	     slot states the one fact a reader scanning the reference wants next to
	     the severity — whether the linter can fix this for them. -->
	<div class="site-meta">
		<SeverityTag severity={reference.severity} />
		<span class="site-meta__separator" aria-hidden="true">·</span>
		<span class="site-code">{reference.id}</span>
		<span class="site-meta__separator" aria-hidden="true">·</span>
		{#if reference.fix}
			<span>{reference.fix.kind === 'safe' ? 'Automatic fix' : 'Previewed fix'}</span>
		{:else}
			<span>No automatic fix</span>
		{/if}
	</div>

	<p>{reference.explanation}</p>

	<h2>Example</h2>
	<figure class="site-sample site-sample--invalid">
		<figcaption class="site-sample__label">Flagged by this rule</figcaption>
		<pre
			class="site-sample__text"
			lang={reference.language}
			dir={reference.language === 'ar' ? 'rtl' : undefined}>{reference.invalid}</pre>
	</figure>
	<figure class="site-sample site-sample--valid">
		<figcaption class="site-sample__label">Accepted by this rule</figcaption>
		<pre
			class="site-sample__text"
			lang={reference.language}
			dir={reference.language === 'ar' ? 'rtl' : undefined}>{reference.valid}</pre>
	</figure>

	<h2>The fix</h2>
	{#if reference.fix}
		{#if reference.fix.kind === 'safe'}
			<p>
				In the workbench this finding carries one control, labelled
				<strong>{reference.fix.label}</strong>. The fix is classified as safe, so pressing it
				applies the edit directly — one press, one undo step.
			</p>
		{:else}
			<p>
				In the workbench this finding carries one control, labelled
				<strong>{reference.fix.label}</strong>. The change is contextual, so it is previewed as a
				diff in your document first and applies only when you confirm it.
			</p>
		{/if}
	{:else}
		<p>
			This finding has no automatic fix — resolving it is a judgment call, so the workbench points
			at the exact range and leaves the edit to you.
		</p>
	{/if}

	<h2>{reference.sources.length === 1 ? 'Source' : 'Sources'}</h2>
	<p>
		{reference.sources.length === 1
			? 'The guideline this rule enforces, as cited on every finding it reports:'
			: 'The guidelines this rule enforces, as cited on every finding it reports:'}
	</p>
	{#each reference.sources as source (source.id)}
		<SourceLink {source} />
	{/each}

	<!-- No "all rules" link. The list is standing beside this column on a wide
	     screen, and on a narrow one the layout's own control at the top of the
	     page is the way back — one of them would always be the second control for
	     a move the reader already has. -->
	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
</main>
