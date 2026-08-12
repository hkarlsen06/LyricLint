<script lang="ts">
	import { ExternalLink } from 'lucide-svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import { guidanceTopics } from '$lib/guidance/entries.js';
	import { authorityLabels, entryAnchor, guidanceTopicTitles } from '$lib/guidance/guidance.js';
	import { getSource } from '$lib/rules/data/sources.js';
	import { fixabilityLabel, ruleSlug } from '$lib/rules/reference-search.js';
	import { siteUrl } from '$lib/seo.js';
	import { codeSegments } from '$lib/ui/site/code-segments.js';
	import GuidanceSearchHighlight from '$lib/ui/site/GuidanceSearchHighlight.svelte';
	import SiteSourceFold from '$lib/ui/site/SiteSourceFold.svelte';
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

	// The topic's other half, read off the section layout's own load rather
	// than derived again — the same rows the index column lists, drawn here so
	// the page reads whole: a reader who arrived at the topic sees where the
	// linter takes over, even on a narrow screen where the list left with the
	// index view.
	const linterRules = $derived(
		data.sections.find((section) => section.topic === topic)?.linterRules ?? []
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
	// heading); `anchor` below is what marks it (the wash in site.css), and
	// `scrollIntoView` scrolls the detail column, which is its nearest scroll
	// port on a wide screen and the document on a narrow one. Both frames of the
	// deferral are load-bearing, and both were measured rather than reasoned
	// into: the router performs its own hash scroll after `afterNavigate` runs,
	// and one frame's deferral still landed first and was scrolled over. Instant
	// rather than smooth, like every other deliberate jump here. Without
	// JavaScript the native jump plus `scroll-margin-top` still lands correctly,
	// one screen position higher.
	//
	// The mark cannot be `:target` alone, and for a while it was: only a native
	// fragment navigation updates the target element, and pressing an index row
	// from the index page or the other topic is the router's navigation — a
	// `pushState`, which updates nothing — so the first press drew no wash, and
	// only a same-path hash press (the one navigation the router leaves to the
	// browser) ever lit one. The page marks the entry itself, from the same
	// hash the landing reads; `:target` stays in the selector as the
	// no-JavaScript arrival's own mark.
	let anchor = $state('');

	function landOnHash() {
		anchor = decodeURIComponent(location.hash.slice(1));
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

<!-- Every string a search can match is drawn through the marker, so a
     guideline opened out of a search says which of its words matched — the
     rule pages' own answer, and the reason the query lives in module state. -->
{#snippet marked(value: string)}<GuidanceSearchHighlight text={value} />{/snippet}

<main class="site-prose site-split__page">
	<h1><GuidanceSearchHighlight text={topicTitle} /></h1>
	<p>
		Conventions the <a href={resolve('/rules/')}>linter</a> cannot check for you, in LyricLint's own words.
		Each one states its standing and links the exact source it is read from.
	</p>

	{#each entries as entry (entry.id)}
		<section
			class="guidelines__entry"
			data-current={anchor === entryAnchor(entry.id) ? true : undefined}
		>
			<!-- The anchor is the id's own last segment, so the index, the assistant,
			     and anything else that cites an entry all name the same fragment. -->
			<h2 id={entryAnchor(entry.id)}><GuidanceSearchHighlight text={entry.title} /></h2>
			<!-- The diagnostic card's own meta idiom: the tier, then the citation —
			     the exact source the claim is read from, whose section and verified
			     date are the link's tooltip. The tier label and the link are one
			     fact read together: the source is what makes the tier true. A
			     folded set still unfolds under the whole line rather than in the
			     middle of it, through the list's own flex `order`. -->
			<div class="site-meta">
				<span><GuidanceSearchHighlight text={authorityLabels[entry.authority]} /></span>
				<span class="site-meta__separator" aria-hidden="true">·</span>
				<SiteSourceFold sources={entrySources(entry.sourceIds)} text={marked} />
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
								href="{resolve('/(site)/rules/[rule]', { rule: ruleSlug(ruleId) })}/"
								><GuidanceSearchHighlight text={ruleId} /></a
							>{/each}
					</span>
				{/if}
			</div>
			<p><GuidanceSearchHighlight text={entry.statement} /></p>
			<!-- The pair, incorrect first — the rule pages' own order — with the color
			     and the word both carrying which is which. A sample holds only text
			     as it would stand in a document: connective prose set in the sample
			     face read as part of the very thing being quoted. -->
			{#if entry.example?.incorrect}
				<figure class="site-sample site-sample--invalid">
					<figcaption class="site-sample__label">Incorrect</figcaption>
					<pre class="site-sample__text"><GuidanceSearchHighlight
							text={entry.example.incorrect}
						/></pre>
				</figure>
			{/if}
			{#if entry.example?.correct}
				<figure class="site-sample site-sample--valid">
					<figcaption class="site-sample__label">Correct</figcaption>
					<pre class="site-sample__text"><GuidanceSearchHighlight
							text={entry.example.correct}
						/></pre>
				</figure>
			{/if}
			{#if entry.note}
				<p class="site-aside"><GuidanceSearchHighlight text={entry.note} /></p>
			{/if}
		</section>
	{/each}

	{#if data.spellings}
		<!-- The reviewed preferred-spellings list, whole, on the topic page a
		     reader wondering about a spelling actually opens. Drawn from the same
		     `ruleLookupTable` the rule page loads — one data source, two surfaces —
		     and only the reviewed halves of it: the forms and the conditions the
		     guide itself states. What the linter does about each row (fix kinds,
		     LyricLint's own curated catches) stays on the rule's page, which is
		     what the sentence under the heading links. -->
		<h2>The standardized spellings</h2>
		<p>
			The reviewed preferred forms, each over the spellings the guide corrects. The
			<a href="{resolve('/(site)/rules/[rule]', { rule: 'spelling-standardized' })}/"
				>linter checks every row</a
			>, and its page also lists the transcription typos LyricLint catches on top.
		</p>
		<ul class="site-run">
			{#each data.spellings.entries as entry, index (index)}
				<li class="rules__lookup-row">
					<p class="rules__lookup-forms">
						{#if entry.instead.length > 0}
							<span class="rules__lookup-from"
								><GuidanceSearchHighlight text={entry.instead.join(', ')} /></span
							>
							<span class="rules__lookup-arrow" aria-hidden="true">→</span>
							<span class="sr-only">becomes</span>
						{/if}
						<span class="rules__lookup-to"
							><GuidanceSearchHighlight text={entry.preferred.join(', ')} /></span
						>
					</p>
					{#each [entry.appliesWhen, entry.note].filter(Boolean) as sentence (sentence)}
						<p class="rules__lookup-note">
							{#each codeSegments(sentence!) as segment, part (part)}
								{#if segment.code}<span class="site-code"
										><GuidanceSearchHighlight text={segment.text} /></span
									>{:else}<GuidanceSearchHighlight text={segment.text} />{/if}
							{/each}
						</p>
					{/each}
				</li>
			{/each}
		</ul>
	{/if}

	{#if linterRules.length > 0}
		<!-- The other half of the topic: the conventions the linter checks itself,
		     as lookups into the rule reference. Derived from the reference at
		     prerender time rather than written here, so a rule that ships,
		     retitles, or retires moves this list on its own. Each row carries the
		     citations' leaving mark, because each one opens the rule reference
		     rather than an entry above it. -->
		<h2>Checked by the linter</h2>
		<p>
			The rest of this topic the <a href={resolve('/rules/')}>linter</a> enforces itself — each of these
			opens the rule's own page, with the reviewed example and the fix:
		</p>
		<ul class="site-run">
			{#each linterRules as rule (rule.id)}
				<li>
					<a href="{resolve('/(site)/rules/[rule]', { rule: rule.slug })}/">
						<span class="site-run__title"
							>{rule.title}
							<ExternalLink
								class="site-run__external"
								aria-hidden="true"
								size={12}
								strokeWidth={2.2}
							/></span
						>
						<span class="site-run__message">{rule.message}</span>
						<!-- The rule index's own meta, whole — these are its rows in
						     another shape, exactly as in the index column beside this
						     page. -->
						<span class="site-run__meta">
							<SeverityTag severity={rule.severity} />
							<span class="site-code">{rule.id}</span>
							<span>{fixabilityLabel(rule.fixability)}</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
</main>
