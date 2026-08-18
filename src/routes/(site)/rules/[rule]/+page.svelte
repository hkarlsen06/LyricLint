<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import SourceLink from '$lib/diagnostics/SourceLink.svelte';
	// Straight from the manifest, not through `$lib/rules/index.js`: that barrel
	// re-exports the engine, the registry and Harper, so one version string taken
	// from it would put all of them back in this page's bundle.
	import { currentRuleSet } from '$lib/rules/data/rule-set.js';
	import { fixabilityLabel } from '$lib/rules/reference-search.js';
	import { siteUrl } from '$lib/seo.js';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	// Shared with the guide on `/rules/` and with the guidance catalog, all
	// three of which quote literal forms inside ordinary sentences.
	import CodeProse from '$lib/ui/site/CodeProse.svelte';
	// Every string on this page goes through it, so the reader who arrived by
	// searching can see what matched instead of hunting for it down a wall of
	// prose and a thirty-row table. Nothing is marked while the field is empty,
	// which is the ordinary state of a page reached by a link.
	import RuleSearchHighlight from '$lib/ui/site/RuleSearchHighlight.svelte';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	// A constant rather than a literal in the mustache, because a bare `{', '}`
	// is `svelte/no-useless-mustaches` — the guidelines topic page's own trade.
	const guidelineSeparator = ', ';

	// Seven rules are a lookup table rather than a judgment, and for those the
	// table is the rule — the reviewed example below only demonstrates one row of
	// it. Loaded by this page rather than carried on the reference, because the
	// reference travels in the section layout's data; `+page.server.ts` has the
	// arithmetic.
	const lookup = $derived(data.lookup);

	/**
	 * Whether the fix behavior is worth stating on every row.
	 *
	 * It varies inside `spelling.standardized` alone — most reviewed spellings are
	 * a one-press fix, the context-gated ones are previewed, and the two
	 * accepted-variant records are flagged by nothing — so there it is the fact a
	 * reader most wants beside the pair. In the other six it is the same words on
	 * every row, which is the repetition that made the diagnostic card drop its
	 * severity word: a label that never varies stops being read by the second row,
	 * and the page's own "The fix" section already says it once.
	 */
	const fixVaries = $derived(new Set((lookup?.entries ?? []).map((entry) => entry.fix)).size > 1);
	const hasCurated = $derived(
		(lookup?.entries ?? []).some((entry) => entry.curatedMisspellings || entry.fuzzy)
	);

	/**
	 * What LyricLint catches beyond the forms the guideline names, as one phrase.
	 *
	 * Two facts, and they are the same fact — this is our own detection rather
	 * than reviewed guidance — so they share one "Also catches" rather than
	 * repeating the words either side of an interpunct. What that phrase means is
	 * said once under the run.
	 */
	function alsoCatches(entry: { curatedMisspellings?: string[]; fuzzy?: boolean }): string {
		const parts = [
			...(entry.curatedMisspellings ? [entry.curatedMisspellings.join(', ')] : []),
			...(entry.fuzzy ? ['one-character typos'] : [])
		];
		return `Also catches ${parts.join(' and ')}`;
	}

	// Picked out of the layout's data rather than loaded again: the whole index is
	// already here, because the list beside this column is drawn from it on every
	// page in the section. `+page.server.ts` is what guarantees the slug names one
	// of them.
	const reference = $derived(
		data.groups.flatMap((group) => group.rules).find((entry) => entry.slug === page.params.rule)!
	);
	// The rule's name, not the message it happens to produce on its example. The
	// index row that opened this page leads with the same string, and a heading
	// that disagreed with the row pressed to reach it reads as having landed
	// somewhere else. The message is still on the page, under the example that
	// produced it, which is what it is a statement about.
	const pageTitle = $derived(`${reference.title} · LyricLint`);
	const canonicalUrl = $derived(siteUrl(`/rules/${reference.slug}/`));
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'TechArticle',
		headline: reference.title,
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

{#snippet sourceText(value: string)}<RuleSearchHighlight text={value} />{/snippet}

<main id="main" tabindex="-1" class="site-prose site-split__page">
	<h1><RuleSearchHighlight text={reference.title} /></h1>

	<!-- The diagnostic's facts in the diagnostic's idiom: one meta line under the
	     message. The line number a card would carry is meaningless here, so its
	     slot states the one fact a reader scanning the reference wants next to
	     the severity — whether the linter can fix this for them. -->
	<div class="site-meta">
		<SeverityTag severity={reference.severity} />
		<span class="site-meta__separator" aria-hidden="true">·</span>
		<span class="site-code"><RuleSearchHighlight text={reference.id} /></span>
		<span class="site-meta__separator" aria-hidden="true">·</span>
		{#if reference.fix}
			<span>{reference.fix.kind === 'safe' ? 'Automatic fix' : 'Previewed fix'}</span>
		{:else}
			<span>No automatic fix</span>
		{/if}
	</div>

	<p><RuleSearchHighlight text={reference.explanation} /></p>

	<!-- The convention this rule is a check of, in the guidance catalog — the
	     reverse of the entry's own "checked by" meta line, derived from the same
	     mapping so the two directions cannot disagree. Same tab, unlike the
	     catalog's links here: a reader on a rule page is looking the convention
	     up, and the guideline is the next thing to read, not a lookup beside
	     one. A deep link lands the topic page on the entry itself. -->
	{#if reference.guidelines?.length}
		<p>
			{reference.guidelines.length === 1
				? 'The convention behind this rule, in the transcription guidelines: '
				: 'The conventions behind this rule, in the transcription guidelines: '}{#each reference.guidelines as guideline, index (`${guideline.topic}#${guideline.anchor}`)}{#if index > 0}{guidelineSeparator}{/if}<a
					href="{resolve('/(site)/guidelines/[topic]', {
						topic: guideline.topic
					})}/#{guideline.anchor}"><RuleSearchHighlight text={guideline.title} /></a
				>{/each}.
		</p>
	{/if}

	<!-- The table, above the example rather than below it, because for these
	     seven rules it is the thing the reader came to look up — the example
	     demonstrates one of its rows. One bordered object with hairlines between
	     the rows, exactly as the linter draws a run of diagnostics: the run is
	     what is separated from the page, and the members from each other by the
	     line where they meet. -->
	{#if lookup}
		<h2>What this rule checks</h2>
		<p><RuleSearchHighlight text={lookup.description} /></p>
		<ul class="site-run">
			{#each lookup.entries as entry, index (index)}
				<li class="rules__lookup-row">
					<p class="rules__lookup-forms">
						{#if entry.instead.length > 0}
							<span class="rules__lookup-from"
								><RuleSearchHighlight text={entry.instead.join(', ')} /></span
							>
							<span class="rules__lookup-arrow" aria-hidden="true">→</span>
							<span class="sr-only">becomes</span>
						{/if}
						<span class="rules__lookup-to"
							><RuleSearchHighlight text={entry.preferred.join(', ')} /></span
						>
					</p>
					{#if entry.curatedMisspellings || entry.fuzzy || (fixVaries && entry.fix)}
						<p class="site-run__meta rules__lookup-meta">
							{#if entry.curatedMisspellings || entry.fuzzy}
								<span><RuleSearchHighlight text={alsoCatches(entry)} /></span>
							{/if}
							{#if (entry.curatedMisspellings || entry.fuzzy) && fixVaries && entry.fix}
								<span class="site-meta__separator" aria-hidden="true">·</span>
							{/if}
							{#if fixVaries && entry.fix}
								<span>{fixabilityLabel(entry.fix)}</span>
							{/if}
						</p>
					{/if}
					{#each [entry.appliesWhen, entry.note].filter(Boolean) as sentence (sentence)}
						<p class="rules__lookup-note">
							<CodeProse text={sentence!} mark={sourceText} />
						</p>
					{/each}
				</li>
			{/each}
		</ul>
		<!-- Said once, under the run, rather than on every row it applies to. The
		     distinction has to be on the page — the guideline does not name any of
		     this — but the sentence carrying it was on 14 of 29 rows verbatim,
		     which is the repetition that stops being read by the second row. -->
		{#if hasCurated}
			<p class="site-aside">
				“Also catches” is LyricLint's own work rather than reviewed guidance: curated transcription
				mistakes, and — where an entry says so — any one-character typo of the preferred form. The
				reviewed guideline names the forms before the arrow and does not name these, and a typo
				caught this way is always previewed rather than fixed in one press.
			</p>
		{/if}
	{/if}

	<h2>Example</h2>
	<figure class="site-sample site-sample--invalid">
		<figcaption class="site-sample__label">Flagged by this rule</figcaption>
		<pre
			class="site-sample__text"
			lang={reference.language}
			dir={reference.language === 'ar' ? 'rtl' : undefined}><RuleSearchHighlight
				text={reference.invalid}
			/></pre>
	</figure>
	<!-- The linter's own wording, beside the text that produces it. A message is
	     written about the occurrence in front of the reader, so this is the one
	     place on the page where it is true without qualification — and quoting it
	     here is what makes the page and the workbench verifiably the same thing.
	     It is derived by running the rule on the sample directly above. -->
	<p class="site-aside">
		In the workbench this reads: <strong><RuleSearchHighlight text={reference.message} /></strong>
	</p>
	<figure class="site-sample site-sample--valid">
		<figcaption class="site-sample__label">Accepted by this rule</figcaption>
		<pre
			class="site-sample__text"
			lang={reference.language}
			dir={reference.language === 'ar' ? 'rtl' : undefined}><RuleSearchHighlight
				text={reference.valid}
			/></pre>
	</figure>

	<h2>The fix</h2>
	{#if reference.fix}
		{#if reference.fix.kind === 'safe'}
			<p>
				In the workbench this finding carries one control, labelled
				<strong><RuleSearchHighlight text={reference.fix.label} /></strong>. The fix is classified
				as safe, so pressing it applies the edit directly — one press, one undo step.
			</p>
		{:else}
			<p>
				In the workbench this finding carries one control, labelled
				<strong><RuleSearchHighlight text={reference.fix.label} /></strong>. The change is
				contextual, so it is previewed as a diff in your document first and applies only when you
				confirm it.
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
	<!-- The citations are searched with everything else on this page, so they mark
	     what matched with everything else on it. The snippet is how that reaches a
	     component the editor also draws — see `SourceLink.svelte`. -->
	{#each reference.sources as source (source.id)}
		<SourceLink {source} text={sourceText} />
	{/each}

	<!-- No "all rules" link. The list is standing beside this column on a wide
	     screen, and on a narrow one the layout's own control at the top of the
	     page is the way back — one of them would always be the second control for
	     a move the reader already has. -->
	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
</main>
