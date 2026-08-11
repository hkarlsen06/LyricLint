<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SourceCitation from '$lib/diagnostics/SourceCitation.svelte';
	import { guidanceTopics } from '$lib/guidance/entries.js';
	import { authorityLabels, entryAnchor, guidanceTopicTitles } from '$lib/guidance/guidance.js';
	import { getSource } from '$lib/rules/data/sources.js';
	import { ruleSlug } from '$lib/rules/reference-search.js';
	import { siteUrl } from '$lib/seo.js';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	// A constant rather than a literal in the mustache, because a bare `{', '}`
	// is `svelte/no-useless-mustaches` — the same trade the rule reference's
	// interpunct runs make.
	const ruleListSeparator = ', ';

	const topic = $derived(data.topic);
	const topicTitle = $derived(guidanceTopicTitles[topic]);
	const entries = $derived(
		guidanceTopics().find((candidate) => candidate.topic === topic)!.entries
	);

	/** The unique sources this page's entries cite, for the structured data. */
	const sources = $derived(
		[...new Set(entries.flatMap((entry) => entry.sourceIds))].flatMap((id) => {
			const source = getSource(id);
			return source ? [source] : [];
		})
	);

	/** An entry's own sources, resolved for its meta line's citations. */
	function entrySources(sourceIds: readonly string[]) {
		return sourceIds.flatMap((id) => {
			const source = getSource(id);
			return source ? [source] : [];
		});
	}

	const pageTitle = $derived(`${topicTitle} · Genius transcription guidelines · LyricLint`);
	const pageDescription = $derived(
		`Genius transcription conventions for ${topicTitle.toLowerCase()}: ${entries
			.map((entry) => entry.title.toLowerCase())
			.join(', ')}.`
	);
	const canonicalUrl = $derived(siteUrl(`/guidelines/${topic}/`));

	// A deep link names one convention out of a column of them, and the native
	// hash jump parks it at the very top of its scroll port, where nothing below
	// it is read. So the landing re-centers the whole entry (not just its
	// heading); `:target` in site.css is what marks it, and `scrollIntoView`
	// scrolls the detail column, which is its nearest scroll port on a wide
	// screen and the document on a narrow one. Both frames of the deferral are
	// load-bearing, and both were measured rather than reasoned into: the router
	// performs its own hash scroll after `afterNavigate` runs, and one frame's
	// deferral still landed first and was scrolled over. Instant rather than
	// smooth, like every other deliberate jump here. Without JavaScript the
	// native jump plus `scroll-margin-top` still lands correctly, one screen
	// position higher.
	function landOnHash() {
		const anchor = decodeURIComponent(location.hash.slice(1));
		if (!anchor) return;
		const heading = document.getElementById(anchor);
		const target = heading?.closest('.guidelines__entry') ?? heading;
		if (!target) return;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }))
		);
	}

	afterNavigate(landOnHash);

	// A navigation that changes only the fragment — the reader pasting a second
	// anchor over the first — is the browser's own, not the router's: no
	// hydration pass, no `afterNavigate`, measured landing at the native top
	// position with the handler never called. `hashchange` is that arrival's
	// only hook.
	$effect(() => {
		window.addEventListener('hashchange', landOnHash);
		return () => window.removeEventListener('hashchange', landOnHash);
	});
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'TechArticle',
		headline: `Genius transcription guidelines: ${topicTitle}`,
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

<main class="site-prose site-split__page">
	<h1>{topicTitle}</h1>
	<p>
		Conventions the <a href={resolve('/rules/')}>linter</a> cannot check for you, in LyricLint's own words.
		Each one states its standing and links the exact source it is read from.
	</p>

	{#each entries as entry (entry.id)}
		<section class="guidelines__entry">
			<!-- The anchor is the id's own last segment, so the index, the assistant,
			     and anything else that cites an entry all name the same fragment. -->
			<h2 id={entryAnchor(entry.id)}>{entry.title}</h2>
			<!-- The diagnostic card's own meta idiom: the tier, then the citation —
			     the exact source the claim is read from, whose section and verified
			     date are the link's tooltip. The tier label and the link are one
			     fact read together: the source is what makes the tier true. -->
			<div class="site-meta">
				<span>{authorityLabels[entry.authority]}</span>
				{#each entrySources(entry.sourceIds) as source (source.id)}
					<span class="site-meta__separator" aria-hidden="true">·</span>
					<SourceCitation {source} />
				{/each}
				{#if entry.relatedRuleIds?.length}
					<span class="site-meta__separator" aria-hidden="true">·</span>
					<span>
						Partly checked by
						<!-- The separator is a value, not markup whitespace, which the
						     formatter is free to move to the wrong side of the comma —
						     `punctuation.question,punctuation.line-ending` is what that
						     looks like, and it looks exactly like working markup. -->
						{#each entry.relatedRuleIds as ruleId, index (ruleId)}{#if index > 0}{ruleListSeparator}{/if}<a
								class="site-code"
								href="{resolve('/(site)/rules/[rule]', { rule: ruleSlug(ruleId) })}/">{ruleId}</a
							>{/each}
					</span>
				{/if}
			</div>
			<p>{entry.statement}</p>
			<!-- The pair, incorrect first — the rule pages' own order — with the color
			     and the word both carrying which is which. A sample holds only text
			     as it would stand in a document: connective prose set in the sample
			     face read as part of the very thing being quoted. -->
			{#if entry.example?.incorrect}
				<figure class="site-sample site-sample--invalid">
					<figcaption class="site-sample__label">Incorrect</figcaption>
					<pre class="site-sample__text">{entry.example.incorrect}</pre>
				</figure>
			{/if}
			{#if entry.example?.correct}
				<figure class="site-sample site-sample--valid">
					<figcaption class="site-sample__label">Correct</figcaption>
					<pre class="site-sample__text">{entry.example.correct}</pre>
				</figure>
			{/if}
			{#if entry.note}
				<p class="site-aside">{entry.note}</p>
			{/if}
		</section>
	{/each}

	<!-- The topic's other half — the conventions the linter checks itself — is
	     deliberately not repeated here: those rows live in the index column
	     under this topic's own heading, on screen beside this page, and a
	     lookup is offered once. -->

	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
</main>
