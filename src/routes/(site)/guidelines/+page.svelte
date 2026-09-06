<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- referenceHref only adds URL state to resolve-derived paths; the lint rule cannot inspect nested calls. */
	import { resolve } from '$app/paths';
	import { referenceHref } from '$lib/ui/site/reference-search.svelte.js';
	import { countGuidanceLookups } from '$lib/guidance/guidance-search.js';
	import {
		authorityLabels,
		guidanceTopicTitles,
		type GuidanceAuthority
	} from '$lib/guidance/guidance.js';
	import { siteUrl } from '$lib/seo.js';
	import AuthorityLadder from '$lib/ui/site/AuthorityLadder.svelte';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	const total = $derived(countGuidanceLookups(data.sections));

	/*
	 * The legend for the authority ladder, ascending as the ladder fills. The
	 * labels come off `authorityLabels` and the bars off `AuthorityLadder` —
	 * the same map and the same component every entry's meta line draws — so
	 * the legend cannot come to state a tier differently than the entries it
	 * explains. The descriptions paraphrase `docs/guidelines.md`, which owns
	 * the ladder's full argument.
	 */
	const tiers: readonly { authority: GuidanceAuthority; description: string }[] = [
		{
			authority: 'lyriclint',
			description:
				"LyricLint's own preference, on a convention no Genius source states — the blank line between song parts, the text-hygiene checks. It shares the bottom step with community guidance, because our preference claims no more standing than unreviewed community writing."
		},
		{
			authority: 'community',
			description:
				'Ordinary community voice in any venue: an unreviewed annotation, guide-page text with no staff badge, an ordinary forum post.'
		},
		{
			authority: 'external',
			description:
				"An authority outside Genius — a dictionary, a language academy, a platform's own documentation. It ranks below a reviewed annotation because it is authoritative about language, not about Genius."
		},
		{
			authority: 'editorial',
			description: 'A reviewed Genius annotation with no staff among its contributors.'
		},
		{
			authority: 'staff',
			description:
				"Genius staff wrote or touched it: a staff-badged guide page, staff among an annotation's contributors, or a staff reply on the forum. Who wrote it decides the tier, never the venue it appears in."
		}
	];

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
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
</svelte:head>

<StructuredData data={structuredData} />

<main id="main" tabindex="-1" class="site-prose site-split__page">
	<h1>Transcription guide</h1>
	<p class="site-lede">
		Write lyrics for Genius with reviewed conventions, clear examples, and the checks that help you
		put them into practice.
	</p>
	<p>Look up a word, paste a warning, or start with a question:</p>
	<ul class="reference-questions">
		<li>
			<a
				href={referenceHref(
					`${resolve('/(site)/guidelines/[topic]', { topic: 'section-headers' })}/`
				)}>How do I label song sections?</a
			>
		</li>
		<li>
			<a
				href={referenceHref(
					`${resolve('/(site)/guidelines/[topic]', { topic: 'section-headers' })}/#artist-identifiers`
				)}>How do I credit different singers?</a
			>
		</li>
		<li>
			<a
				href={referenceHref(
					`${resolve('/(site)/guidelines/[topic]', { topic: 'censored-unknown' })}/#unknown-marker`
				)}>What if I cannot hear a word?</a
			>
		</li>
		<li>
			<a
				href={referenceHref(
					`${resolve('/(site)/guidelines/[topic]', { topic: 'section-headers' })}/#parenthetical-formatting`
				)}>How do I write backing vocals?</a
			>
		</li>
	</ul>

	<details class="reference-disclosure">
		<summary>Sources and the authority ladder</summary>
		<p>
			Each entry names its source and authority tier. A linked linter check may cover only part of a
			convention; read its example and the entry’s qualifications for the limits.
		</p>
		<p>
			The ascending bars ahead of each entry's tier label are its standing drawn as a ladder: four
			steps for the four source tiers, filled up to the tier the entry's sources establish. Climbing
			it is evidence, never an edit — an entry rises only when a higher-tier source confirming it
			joins its citations.
		</p>
		<!-- The term is the entries' own pairing — the ladder and the label the meta
	     lines draw — so a reader can carry the mark from here to any entry. The
	     ladder stays `aria-hidden` as it is everywhere: the label is the fact. -->
		<dl class="guidelines__tiers">
			{#each tiers as { authority, description } (authority)}
				<div>
					<dt>
						<AuthorityLadder {authority} />
						{authorityLabels[authority]}
					</dt>
					<dd>{description}</dd>
				</div>
			{/each}
		</dl>
	</details>

	<details id="harper" class="reference-disclosure">
		<summary>Proofreading alongside transcription checks</summary>
		<p>
			The workbench also uses Harper for English spelling, grammar, and style suggestions. Those
			suggestions come from the proofreader, so they are not listed here as Genius conventions. Read
			them in the context of the lyrics before applying a change.
		</p>
	</details>

	<div class="site-actions">
		<a class="button" href={resolve('/workbench/')}>Check a transcription in the workbench</a>
	</div>
</main>
