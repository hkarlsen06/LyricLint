<script lang="ts">
	import { resolve } from '$app/paths';
	import { currentRuleSet } from '$lib/rules/index.js';
	import { ruleReferences } from '$lib/rules/reference.js';
	import { siteUrl } from '$lib/seo.js';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';

	// The list itself is in the layout, which is what keeps it standing while the
	// reader moves between rules. What is left here is what the detail column
	// shows when no rule is open — the section's own introduction, in the same
	// slot a rule will occupy.
	const references = ruleReferences();
	const ruleCount = references.length;
	const pageTitle = 'Genius lyric formatting rules · LyricLint';
	const pageDescription = `Browse ${ruleCount} sourced Genius lyric-formatting rules for section headers, performers, spelling, punctuation, and ad-libs, each with reviewed guidance.`;
	const canonicalUrl = siteUrl('/rules/');
	const structuredData = {
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: 'Genius lyric formatting rules',
		url: canonicalUrl,
		description: pageDescription,
		numberOfItems: ruleCount,
		hasPart: references.map((reference) => ({
			'@type': 'TechArticle',
			headline: reference.message,
			description: reference.seoDescription,
			url: siteUrl(`/rules/${reference.slug}/`)
		}))
	};
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

<main class="site-prose rules__page">
	<h1>Genius lyric formatting rules</h1>
	<p class="site-lede">
		The {ruleCount} transcription conventions LyricLint checks, exactly as its linter states them.
	</p>
	<p>
		Every rule on this list cites the Genius guideline it enforces — page, section, and the date a
		person last verified it — so you can read the source instead of taking the linter's word for it.
		The titles beside this one are the linter's own messages, produced by running each rule against
		the example its test suite reviews: what these pages say is what the workbench says. This is
		rule set {currentRuleSet.version}.
	</p>

	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
	<p class="site-aside">Runs entirely in your browser — no account, no upload.</p>
</main>
