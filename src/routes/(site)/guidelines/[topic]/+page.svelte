<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- referenceHref only adds URL state to base-prefixed or resolve-derived paths; the lint rule cannot inspect nested calls. */
	import { afterNavigate } from '$app/navigation';
	import { base, resolve } from '$app/paths';
	import { referenceHref } from '$lib/ui/site/reference-search.svelte.js';
	import { guidanceTopics } from '$lib/guidance/entries.js';
	import {
		authorityLabels,
		entryAnchor,
		guidanceTopicLandmarks,
		guidanceTopicTitles
	} from '$lib/guidance/guidance.js';
	import { getSource } from '$lib/rules/data/sources.js';
	import { referenceTopics } from '$lib/reference/topics.js';
	import { siteUrl } from '$lib/seo.js';
	import AuthorityLadder from '$lib/ui/site/AuthorityLadder.svelte';
	import CodeProse from '$lib/ui/site/CodeProse.svelte';
	import GuidanceSearchHighlight from '$lib/ui/site/GuidanceSearchHighlight.svelte';
	import SiteSourceFold from '$lib/ui/site/SiteSourceFold.svelte';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import { setReadingAnchor } from '$lib/ui/site/guidance-reading.svelte.js';
	import { safeDecodeHash } from '$lib/ui/site/hash.js';
	import type { PageProps, Snapshot } from './$types.js';

	let { data }: PageProps = $props();

	const topic = $derived(data.topic);
	const topicTitle = $derived(
		referenceTopics.find((item) => item.id === topic)?.title ?? guidanceTopicTitles[topic]
	);
	const entries = $derived(
		guidanceTopics().find((candidate) => candidate.topic === topic)!.entries
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

	/**
	 * The unique sources this page cites, for the structured data — the
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
	const pageTitle = $derived(`${topicTitle} · Transcription guide · LyricLint`);
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

	/**
	 * The first section in document order, which is not always the first entry:
	 * the spelling topic opens on the standardized-spellings landmark, and that
	 * section carries no entry of its own. Falling back to `entries[0]` marked
	 * the *second* row while the reader was still at the top of the page — the
	 * one row the mark is least allowed to be wrong about, since a topic opened
	 * with no fragment is the commonest arrival there is.
	 *
	 * Read off `data.spellings` rather than off the DOM: this is answered before
	 * the landing scroll and, on the first pass, before anything is bound.
	 */
	const SPELLINGS_ANCHOR = 'standardized-spellings';
	const leadAnchor = $derived(data.spellings ? SPELLINGS_ANCHOR : entryAnchor(entries[0]!.id));

	/**
	 * The landmark's own record, for the standing and the citation its section
	 * draws. Looked up rather than restated here: the tier and the source ids
	 * are what `guidance.test.ts` holds to the entries' promotion rule, and a
	 * second copy written into the markup is the one that would drift.
	 */
	const spellingsLandmark = $derived(
		guidanceTopicLandmarks[topic]?.find((landmark) => entryAnchor(landmark.id) === SPELLINGS_ANCHOR)
	);

	function updateLanding(scrollToAnchor: boolean) {
		// The same shared decode the index column reads its own mark through: a
		// fragment is somebody else's string, and `#%` is a `URIError` rather than
		// an anchor — thrown here it would take the topic page down on the arrival
		// a deep link exists for.
		anchor = safeDecodeHash(location.hash.slice(1));
		// The landing is also this page's first word to the index about where the
		// reader is, and it is said before the scroll rather than left to the spy
		// below to work out afterwards. Computed from a document still at its top,
		// the reading position is the leading section — so the list would mark that
		// row, travel to it, and be corrected a frame later when the landing
		// scroll finally fired. Deep-linked, the entry you were sent to is the one
		// you are reading; with no fragment, it is whatever leads the page.
		//
		// Only a fragment that resolves is published, and that is the correction:
		// a stale or hand-typed `#anythin` names no heading here, and published
		// anyway it was a reading position no row in the index could match — so
		// the list marked *nothing* until the reader's next scroll, on the one
		// arrival where a wrong fragment already left them with no wash either.
		// The wash keeps the raw hash, because a hash matching no entry correctly
		// draws nothing.
		const heading = anchor ? document.getElementById(anchor) : null;
		setReadingAnchor(heading ? anchor : leadAnchor);
		if (!heading || !scrollToAnchor) return;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => heading.scrollIntoView({ block: 'start' }))
		);
	}

	function landOnHash(): void {
		updateLanding(true);
	}

	// Back restores the reader's precise position, including a check opened below
	// the entry heading. Refresh selection without overriding browser restoration.
	afterNavigate(({ type }) => updateLanding(type !== 'popstate'));

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

	// Disclosure height changes during restoration. Restore its reading position
	// after both native open states and the router's own scroll pass have settled.
	export const snapshot: Snapshot<{ checks: string[]; detailY: number; windowY: number }> = {
		capture: () => ({
			checks: Array.from(
				article?.querySelectorAll<HTMLDetailsElement>('details[data-check-id][open]') ?? [],
				(element) => element.dataset.checkId!
			),
			detailY: article?.closest<HTMLElement>('.site-split__detail')?.scrollTop ?? 0,
			windowY: window.scrollY
		}),
		restore: (saved) => {
			const restoredUrl = location.href;
			for (const element of article?.querySelectorAll<HTMLDetailsElement>(
				'details[data-check-id]'
			) ?? []) {
				element.open = saved.checks.includes(element.dataset.checkId!);
			}
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					if (location.href !== restoredUrl) return;
					const detail = article?.closest<HTMLElement>('.site-split__detail');
					if (!detail) return;
					detail.scrollTop = saved.detailY;
					if (getComputedStyle(detail).overflowY === 'visible') window.scrollTo(0, saved.windowY);
				})
			);
		}
	};

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
		return current || leadAnchor;
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

<!-- Every string a search can match is drawn through the marker, so a
     guideline opened out of a search says which of its words matched — the
     rule pages' own answer, using the shared reference query. -->
{#snippet marked(value: string)}<GuidanceSearchHighlight text={value} />{/snippet}

<!-- Explanations describe a reviewed occurrence, so they open with the exact
     input that produced them. Native disclosures keep long check inventories compact. -->
{#snippet checkList(checks: readonly PageProps['data']['additionalChecks'][number][])}
	<ul class="guidelines__checks">
		{#each checks as check (check.href)}
			<li>
				<details data-check-id={check.id}>
					<summary><GuidanceSearchHighlight text={check.title} /></summary>
					<figure class="site-sample site-sample--invalid">
						<figcaption class="site-sample__label">Flagged example</figcaption>
						<pre
							class="site-sample__text"
							lang={check.language}
							dir={check.language === 'ar' ? 'rtl' : undefined}><GuidanceSearchHighlight
								text={check.invalid}
							/></pre>
					</figure>
					<p><GuidanceSearchHighlight text={check.explanation} /></p>
					<figure class="site-sample site-sample--valid">
						<figcaption class="site-sample__label">Accepted by this check</figcaption>
						<pre
							class="site-sample__text"
							lang={check.language}
							dir={check.language === 'ar' ? 'rtl' : undefined}><GuidanceSearchHighlight
								text={check.valid}
							/></pre>
					</figure>
					<p>
						<a
							href={referenceHref(`${base}${check.href}`)}
							aria-label={`See trigger and fix: ${check.title}`}>See trigger and fix</a
						>
					</p>
				</details>
			</li>
		{/each}
	</ul>
{/snippet}

<main id="main" tabindex="-1" class="site-prose site-split__page" bind:this={article}>
	<h1><GuidanceSearchHighlight text={topicTitle} /></h1>
	<p class="site-lede">Reviewed conventions, examples, and the sources behind them.</p>
	{#if entries.some((entry) => entry.relatedRuleIds?.length) || data.spellings || data.additionalChecks.length}
		<p>
			The checks below catch specific patterns in your text. They support your review; passing them
			does not verify every part of a convention.
		</p>
	{/if}

	{#if data.spellings}
		<!-- A landmark is a deep-link target exactly as an entry is — the index
		     lists it and every rule page's guideline link can name it — so it
		     takes the arrival wash through the same mark rather than through
		     `:target`, which only a native fragment navigation ever sets. -->
		<section
			class="guidelines__landmark"
			data-current={anchor === SPELLINGS_ANCHOR ? true : undefined}
		>
			<!-- The reviewed preferred-spellings list leads the topic page a reader
		     wondering about a spelling actually opens. Drawn from the same
		     `ruleLookupTable` the rule page loads — one data source, two surfaces —
		     and only the reviewed halves of it: the forms and the conditions the
		     guide itself states. What the linter does about each row (fix kinds,
		     LyricLint's own curated catches) stays on the rule's page, which is
		     what the sentence under the heading links. -->
			<h2 id={SPELLINGS_ANCHOR}>The standardized spellings</h2>
			{#if spellingsLandmark}
				<!-- The entries' own meta idiom, in the section that leads the page:
				     the ladder, the tier, and the exact source the table is read
				     from. It carries no "Checked by" run, and that is the one
				     difference from an entry's line — the sentence directly beneath
				     already links `spelling.standardized`'s page in prose, and a
				     second link to it a line above would be the same command
				     offered twice on one surface. -->
				<div class="site-meta">
					<AuthorityLadder authority={spellingsLandmark.authority} />
					<span
						><GuidanceSearchHighlight text={authorityLabels[spellingsLandmark.authority]} /></span
					>
					<span class="site-meta__separator" aria-hidden="true">·</span>
					<SiteSourceFold sources={entrySources(spellingsLandmark.sourceIds)} text={marked} />
				</div>
			{/if}
			<p>The reviewed preferred forms, each over the spellings the guide corrects.</p>
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
							<p class="rules__lookup-note"><CodeProse text={sentence!} mark={marked} /></p>
						{/each}
					</li>
				{/each}
			</ul>
			{#if data.checksById['spelling.standardized']}
				<h3>What LyricLint checks</h3>
				{@render checkList([data.checksById['spelling.standardized']])}
			{/if}
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
			     fact read together: the source is what makes the tier true. The
			     ladder ahead of the label draws that standing as ascending steps
			     (`AuthorityLadder.svelte`, `aria-hidden` — the label is the fact).
			     A folded set still unfolds under the whole line rather than in the
			     middle of it, through the list's own flex `order`. -->
			<div class="site-meta">
				<AuthorityLadder authority={entry.authority} />
				<span><GuidanceSearchHighlight text={authorityLabels[entry.authority]} /></span>
				<span class="site-meta__separator" aria-hidden="true">·</span>
				<SiteSourceFold sources={entrySources(entry.sourceIds)} text={marked} />
			</div>
			<!-- The forms a convention names — `[Verse 1]`, `gon'`, `'90s` — are
			     written in backticks in the entry and set in the code face here,
			     because a form left in the sentence's own type is a word of the
			     sentence: `and rather than an'` reads as a conjunction until the
			     face says it is being quoted. The catalog's own titles carry
			     none, since the index draws those as plain strings. -->
			<p><CodeProse text={entry.statement} mark={marked} /></p>
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
			<!-- The note is the convention's own qualifications — where the rule
			     bends, which half the linter checks — not a colophon about the
			     entry. Set as muted small print it read as skippable and was
			     genuinely hard to read over the dark scheme, so it is ordinary
			     prose like the statement above it: sitting after the samples is
			     what says it qualifies them, and position does not need a tone
			     to help it. -->
			{#if entry.note}
				<h3>Exceptions and context</h3>
				<p><CodeProse text={entry.note} mark={marked} /></p>
			{/if}
			{#if entry.relatedRuleIds?.length}
				<h3>What LyricLint checks</h3>
				{@render checkList(
					entry.relatedRuleIds.flatMap((id) => (data.checksById[id] ? [data.checksById[id]] : []))
				)}
			{/if}
		</section>
	{/each}

	{#if data.additionalChecks.length}
		<section aria-labelledby="additional-checks">
			<h2 id="additional-checks">More checks for this topic</h2>
			<p>
				These checks cover other patterns in this topic. Each explains its source, trigger, and
				suggested correction.
			</p>
			{@render checkList(data.additionalChecks)}
		</section>
	{/if}

	<div class="site-actions">
		<a class="button" href={resolve('/lint/')}>Check a transcription in the workbench</a>
	</div>
</main>

<style>
	.guidelines__checks {
		list-style: none;
		padding: 0;
		margin: var(--space-3) 0 0;
	}
	.guidelines__checks li + li {
		margin-top: var(--space-4);
	}
	.guidelines__checks summary {
		font-weight: var(--font-weight-medium);
	}
	.guidelines__checks p {
		margin: var(--space-1) 0 0;
	}
</style>
