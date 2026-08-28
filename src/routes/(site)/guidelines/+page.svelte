<script lang="ts">
	import { resolve } from '$app/paths';
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

	/**
	 * The detail column at `/guidelines/` says what the catalog is, the rule
	 * reference's own arrangement: the finder and every convention are in the column
	 * beside this one, so the page's job is the part a list cannot carry — where
	 * the conventions come from and how much standing each tier has.
	 */
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

	// Title case, because a tab is a label rather than a sentence: `Genius
	// transcription guidelines · LyricLint` read as the middle of a sentence
	// somebody had cut in half, next to a row of tabs that are all names.
	const pageTitle = 'Genius Transcription Guidelines · LyricLint';
	const pageDescription = $derived(
		`Reviewed Genius transcription conventions in one place — ${total} of them, each with its source, each naming the linter rules that check it.`
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

<main id="main" tabindex="-1" class="site-prose site-split__page">
	<h1>Genius Transcription Guidelines</h1>
	<p class="site-lede">
		Every guideline we have found for writing lyrics on Genius, compiled from staff guides, accepted
		annotations, and staff rulings. Each one is stated here with the source behind it, and where the
		workbench's <a href={resolve('/rules/')}>linter</a> checks a convention, the entry names the rules
		that do — as each rule's own page links back to its convention here.
	</p>
	<p>
		Every entry says how much standing it has — the ascending bars ahead of its tier label — and
		claims only the tier its sources establish. The ladder at the foot of this page reads out what
		each level means.
	</p>

	<h2>The topics so far</h2>
	<p>Every convention is in the list beside this page; each topic also reads whole:</p>
	<ul class="site-run">
		{#each data.sections as { topic, entries, landmarks } (topic)}
			{@const count = entries.length + (landmarks?.length ?? 0)}
			<li>
				<a href="{resolve('/(site)/guidelines/[topic]', { topic })}/">
					<span class="site-run__title">{guidanceTopicTitles[topic]}</span>
					<span class="site-run__message">
						{count}
						{count === 1 ? 'convention' : 'conventions'}
					</span>
				</a>
			</li>
		{/each}
	</ul>

	<h2>The authority ladder</h2>
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

	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
</main>
