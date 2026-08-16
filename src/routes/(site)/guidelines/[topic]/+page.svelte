<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { guidanceTopics } from '$lib/guidance/entries.js';
	import { authorityLabels, entryAnchor, guidanceTopicTitles } from '$lib/guidance/guidance.js';
	import { getSource } from '$lib/rules/data/sources.js';
	import { ruleSlug } from '$lib/rules/reference-search.js';
	import { siteUrl } from '$lib/seo.js';
	import { codeSegments } from '$lib/ui/site/code-segments.js';
	import GuidanceSearchHighlight from '$lib/ui/site/GuidanceSearchHighlight.svelte';
	import LinterRuleRow from '$lib/ui/site/LinterRuleRow.svelte';
	import SiteSourceFold from '$lib/ui/site/SiteSourceFold.svelte';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import { setReadingAnchor } from '$lib/ui/site/guidance-reading.svelte.js';
	import { safeDecodeHash } from '$lib/ui/site/hash.js';
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

	// The rule keeps context-sensitive spellings as separate records because
	// they have different fix contracts. This reader-facing table can group
	// records that land on the same preferred form: the condition remains with
	// the combined row, without presenting one spelling as two conventions.
	const displayedSpellings = $derived.by(() => {
		const grouped: Array<{
			preferred: string[];
			instead: string[];
			appliesWhen: string[];
			notes: string[];
		}> = [];

		for (const entry of data.spellings?.entries ?? []) {
			let row = grouped.find(
				(candidate) => JSON.stringify(candidate.preferred) === JSON.stringify(entry.preferred)
			);
			if (!row) {
				row = { preferred: entry.preferred, instead: [], appliesWhen: [], notes: [] };
				grouped.push(row);
			}
			row.instead.push(...entry.instead);
			if (entry.appliesWhen) row.appliesWhen.push(entry.appliesWhen);
			if (entry.note) row.notes.push(entry.note);
		}

		return grouped;
	});

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

	// Title case for the section's own name, exactly as the index page's tab
	// carries it: a tab is a label, not a sentence. The topic's title leads,
	// because a tab shows its first few characters and the topic is what tells
	// two of these apart.
	const pageTitle = $derived(`${topicTitle} · Genius Transcription Guidelines · LyricLint`);
	const pageDescription = $derived(
		`Genius transcription conventions for ${topicTitle.toLowerCase()}: ${entries
			.map((entry) => entry.title.toLowerCase())
			.join(', ')}.`
	);
	const canonicalUrl = $derived(siteUrl(`/guidelines/${topic}/`));

	// A deep link names one convention out of a column of them, so the named
	// heading is the first thing the reader should meet. `anchor` below is what
	// marks it (the wash in site.css), and
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
		// The same shared decode the index column reads its own mark through: a
		// fragment is somebody else's string, and `#%` is a `URIError` rather than
		// an anchor — thrown here it would take the topic page down on the arrival
		// a deep link exists for.
		anchor = safeDecodeHash(location.hash.slice(1));
		// The landing is also this page's first word to the index about where the
		// reader is, and it is said before the scroll rather than left to the spy
		// below to work out afterwards. Computed from a document still at its top,
		// the reading position is the first entry — so the list would mark that
		// row, travel to it, and be corrected a frame later when the landing
		// scroll finally fired. Deep-linked, the entry you were sent to is the one
		// you are reading; with no fragment, it is the first.
		setReadingAnchor(anchor || entryAnchor(entries[0]!.id));
		if (!anchor) return;
		const heading = document.getElementById(anchor);
		if (!heading) return;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => heading.scrollIntoView({ block: 'start' }))
		);
	}

	afterNavigate(landOnHash);

	/**
	 * Which entry the reader is on: the last heading to have crossed the reading
	 * line directly under the pinned chrome.
	 *
	 * The same header-and-gap tokens are the heading's `scroll-margin-top`, so
	 * the landing and the spy agree by construction. On a wide screen the detail
	 * column is the scroll port and contributes its own top; on a narrow screen
	 * the window scrolls and the line starts at the viewport's top.
	 */
	let article = $state<HTMLElement>();

	function readingEntry(): string {
		const firstHeading = article?.querySelector<HTMLElement>('h2[id]');
		const clearance = firstHeading
			? Number.parseFloat(getComputedStyle(firstHeading).scrollMarginTop)
			: 0;
		const detail = article?.closest<HTMLElement>('.site-split__detail');
		const detailTop =
			detail && getComputedStyle(detail).overflowY !== 'visible'
				? detail.getBoundingClientRect().top
				: 0;
		const line = detailTop + clearance;
		let current = '';
		for (const section of article?.querySelectorAll('.guidelines__entry, .guidelines__landmark') ??
			[]) {
			if (section.getBoundingClientRect().top > line) break;
			current = section.querySelector('h2')?.id ?? current;
		}
		// Above the first heading the reader is in the lede, on their way into the
		// first convention — which is the row worth marking, and the same answer a
		// topic opened with no fragment lands on.
		return current || entryAnchor(entries[0]!.id);
	}

	// One pass per frame at most, because a scroll fires far faster than a
	// layout read is worth doing: the handler is a rect per entry, which is
	// cheap, and doing it a dozen times inside one frame is not. Bound in the
	// capture phase on the document rather than on the scroll port, since which
	// element scrolls is the layout's business — the column at one width and the
	// document at the other — and a scroll event does not bubble to where that
	// could be ignored.
	let frame = 0;

	function spy(): void {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			setReadingAnchor(readingEntry());
		});
	}

	$effect(() => {
		// Re-read when the topic changes: the same component draws every topic,
		// and the entries under it are what this measures.
		void topic;
		document.addEventListener('scroll', spy, true);
		window.addEventListener('resize', spy);
		return () => {
			cancelAnimationFrame(frame);
			frame = 0;
			document.removeEventListener('scroll', spy, true);
			window.removeEventListener('resize', spy);
			// The index outlives this page, so a reading position left behind is a
			// row marked in a list whose page has gone — the rule guide's hover
			// clears itself for the same reason.
			setReadingAnchor('');
		};
	});

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
		headline: `Genius Transcription Guidelines: ${topicTitle}`,
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

<main class="site-prose site-split__page" bind:this={article}>
	<h1><GuidanceSearchHighlight text={topicTitle} /></h1>
	<p>
		Conventions the <a href={resolve('/rules/')}>linter</a> cannot check for you, in LyricLint's own words.
		Each one states its standing and links the exact source it is read from.
	</p>

	{#if data.spellings}
		<section class="guidelines__landmark">
			<!-- The reviewed preferred-spellings list leads the topic page a reader
		     wondering about a spelling actually opens. Drawn from the same
		     `ruleLookupTable` the rule page loads — one data source, two surfaces —
		     and only the reviewed halves of it: the forms and the conditions the
		     guide itself states. What the linter does about each row (fix kinds,
		     LyricLint's own curated catches) stays on the rule's page, which is
		     what the sentence under the heading links. -->
			<h2 id="standardized-spellings">The standardized spellings</h2>
			<p>
				The reviewed preferred forms, each over the spellings the guide corrects. The
				<a href="{resolve('/(site)/rules/[rule]', { rule: 'spelling-standardized' })}/"
					>linter checks every row</a
				>, and its page also lists the transcription typos LyricLint catches on top.
			</p>
			<ul class="site-run">
				{#each displayedSpellings as entry, index (index)}
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
						{#each [...entry.appliesWhen, ...entry.notes] as sentence (sentence)}
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
		</section>
	{/if}

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
						<!-- A tab, exactly as the rows below do it and for the same reason:
						     this one is read mid-entry, which is the worst place in the
						     section to lose a scroll position to a lookup. No mark beside
						     it — a glyph after every id in a comma list is a run of marks
						     rather than a note — so the sr-only text is the whole of what
						     says the press opens a tab. -->
						{#each entry.relatedRuleIds as ruleId, index (ruleId)}{#if index > 0}{ruleListSeparator}{/if}<a
								class="site-code"
								href="{resolve('/(site)/rules/[rule]', { rule: ruleSlug(ruleId) })}/"
								target="_blank"
								rel="noopener noreferrer"
								><GuidanceSearchHighlight text={ruleId} /><span class="sr-only"
									>(opens in a new tab)</span
								></a
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
				<!-- One line each, the index column's own row — `LinterRuleRow` is
				     shared by both, because these are the same rows drawn twice and
				     the copy that drifted would be the one nobody is looking at. -->
				<LinterRuleRow {rule} />
			{/each}
		</ul>
	{/if}

	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
</main>
