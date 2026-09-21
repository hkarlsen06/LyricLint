<script module lang="ts">
	export type GuideReadingSnapshot = { checks: number[]; detailY: number; windowY: number };
</script>

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
	import AuthorityLadder from '$lib/ui/site/AuthorityLadder.svelte';
	import CodeProse from '$lib/ui/site/CodeProse.svelte';
	import GuidanceSearchHighlight from '$lib/ui/site/GuidanceSearchHighlight.svelte';
	import SiteSourceFold from '$lib/ui/site/SiteSourceFold.svelte';
	import { setReadingAnchor } from '$lib/ui/site/guidance-reading.svelte.js';
	import { safeDecodeHash } from '$lib/ui/site/hash.js';
	import { stickyTopics } from './sticky-topics.js';
	import type { Snapshot } from '@sveltejs/kit';
	import type { LayoutData } from '../../../routes/(site)/guidelines/$types.js';
	import type { GuidanceTopic } from '$lib/guidance/guidance.js';

	let { data, topic }: { data: LayoutData; topic?: GuidanceTopic } = $props();

	const entries = $derived(
		guidanceTopics().find((candidate) => candidate.topic === topic)?.entries ?? []
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

	/** An entry's own sources, resolved for its meta line's citations. */
	function entrySources(sourceIds: readonly string[]) {
		return sourceIds.flatMap((id) => {
			const source = getSource(id);
			return source ? [source] : [];
		});
	}

	// Land vertically after the router's own hash-scroll pass. SectionSplit owns
	// horizontal travel, so the heading must never scroll its ancestors.
	// Explicit marking also handles pushState arrivals, which do not update :target.
	let anchor = $state('');

	// Topic URLs enter the complete guide at their first convention or landmark.
	const SPELLINGS_ANCHOR = 'standardized-spellings';
	const leadAnchor = $derived(
		topic === 'spelling' ? SPELLINGS_ANCHOR : entries[0] ? entryAnchor(entries[0].id) : ''
	);

	/**
	 * The landmark's own record, for the standing and the citation its section
	 * draws. Looked up rather than restated here: the tier and the source ids
	 * are what `guidance.test.ts` holds to the entries' promotion rule, and a
	 * second copy written into the markup is the one that would drift.
	 */
	const spellingsLandmark = $derived(
		guidanceTopicLandmarks.spelling?.find(
			(landmark) => entryAnchor(landmark.id) === SPELLINGS_ANCHOR
		)
	);

	function updateLanding(scrollToAnchor: boolean) {
		if (!topic) return;
		anchor = safeDecodeHash(location.hash.slice(1));
		const target = anchor ? document.getElementById(anchor) : null;
		const heading = target ?? document.getElementById(`topic-${topic}`);
		setReadingAnchor(target ? anchor : leadAnchor);
		if (!heading || !scrollToAnchor) return;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				const detail = heading.closest<HTMLElement>('.site-split__detail');
				if (!detail) return;
				const section = heading.closest<HTMLElement>('section') ?? heading;
				detail.scrollTop +=
					section.getBoundingClientRect().top -
					detail.getBoundingClientRect().top -
					Number.parseFloat(getComputedStyle(heading).scrollMarginTop);
			})
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
	 * Landing and the spy share the heading's `scroll-margin-top`, including the
	 * pinned topic's measured wrap. Both use natural section positions: a sticky
	 * heading's painted position stops describing where its content starts.
	 */
	let article = $state<HTMLElement>();

	// Disclosure height changes during restoration. Restore its reading position
	// after both native open states and the router's own scroll pass have settled.
	export const snapshot: Snapshot<GuideReadingSnapshot> = {
		capture: () => ({
			checks: Array.from(
				article?.querySelectorAll<HTMLDetailsElement>('details[data-check-id]') ?? []
			).flatMap((element, index) => (element.open ? [index] : [])),
			detailY: article?.closest<HTMLElement>('.site-split__detail')?.scrollTop ?? 0,
			windowY: window.scrollY
		}),
		restore: (saved) => {
			const restoredUrl = location.href;
			// A check can appear under several conventions. Restore only the occurrence opened.
			article
				?.querySelectorAll<HTMLDetailsElement>('details[data-check-id]')
				.forEach((element, index) => {
					element.open = saved.checks.includes(index);
				});
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
		const detail = article?.closest<HTMLElement>('.site-split__detail');
		const detailTop =
			detail && getComputedStyle(detail).overflowY !== 'visible'
				? detail.getBoundingClientRect().top
				: 0;
		let current = '';
		for (const section of article?.querySelectorAll<HTMLElement>(
			'.guide-topic, .guidelines__entry, .guidelines__landmark'
		) ?? []) {
			const heading = section.querySelector('h2');
			const clearance = heading ? Number.parseFloat(getComputedStyle(heading).scrollMarginTop) : 0;
			// Native scrollTop rounds the landing while the measured clearance stays fractional.
			if (section.getBoundingClientRect().top > detailTop + clearance + 1) break;
			current = section.dataset.readingAnchor ?? section.querySelector('h2')?.id ?? current;
		}
		// Above the first heading the reader is in the lede, on their way into the
		// first convention, which is the row worth marking, and the same answer a
		// topic opened with no fragment lands on.
		return (
			current ||
			article?.querySelector<HTMLElement>('.guide-topic')?.dataset.readingAnchor ||
			leadAnchor
		);
	}

	// One pass per frame at most, because a scroll fires far faster than a
	// layout read is worth doing: the handler is a rect per entry, which is
	// cheap, and doing it a dozen times inside one frame is not. Bound in the
	// capture phase on the document rather than on the scroll port, since which
	// element scrolls is the layout's business (the column at one width and the
	// document at the other), and a scroll event does not bubble to where that
	// could be ignored.
	let frame = 0;

	function spy(): void {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			const detail = article?.closest<HTMLElement>('.site-split__detail');
			const bounds = detail?.getBoundingClientRect();
			if (bounds && bounds.left < window.innerWidth && bounds.right > 0) {
				setReadingAnchor(readingEntry());
			}
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
			// row marked in a list whose page has gone; the rule guide's hover
			// clears itself for the same reason.
			setReadingAnchor('');
		};
	});

	// A navigation that changes only the fragment (the reader pasting a second
	// anchor over the first) is the browser's own, not the router's: no
	// hydration pass, no `afterNavigate`, measured landing at the native top
	// position with the handler never called. `hashchange` is that arrival's
	// only hook.
	$effect(() => {
		window.addEventListener('hashchange', landOnHash);
		return () => window.removeEventListener('hashchange', landOnHash);
	});
</script>

<!-- Every string a search can match is drawn through the marker, so a
     guideline opened out of a search says which of its words matched, the
     rule pages' own answer, using the shared reference query. -->
{#snippet marked(value: string)}<GuidanceSearchHighlight text={value} />{/snippet}

<!-- Explanations describe a reviewed occurrence, so they open with the exact
     input that produced them. Native disclosures keep long check inventories compact. -->
{#snippet checkList(checks: readonly LayoutData['sections'][number]['additionalChecks'][number][])}
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

<main
	id="main"
	tabindex="-1"
	class="site-prose site-split__page"
	bind:this={article}
	use:stickyTopics={data.sections}
>
	<div class="guide-glass" aria-hidden="true"></div>
	<h1>Transcription guide</h1>
	<p class="site-lede">Reviewed conventions, examples, and the sources behind them.</p>
	<p>
		The checks below catch specific patterns in your text. They support your review; passing them
		does not verify every part of a convention.
	</p>
	{#each data.sections as section (section.topic)}
		{@const topic = section.topic}
		{@const entries = guidanceTopics().find((candidate) => candidate.topic === topic)!.entries}
		{@const title =
			referenceTopics.find((item) => item.id === topic)?.title ?? guidanceTopicTitles[topic]}
		<section
			class="guide-topic"
			aria-labelledby={`topic-${topic}`}
			data-reading-anchor={topic === 'spelling'
				? SPELLINGS_ANCHOR
				: entries[0]
					? entryAnchor(entries[0].id)
					: ''}
		>
			<div class="guide-topic-pin">
				<h2 class="guide-topic-title guidelines__topic" id={`topic-${topic}`}>{title}</h2>
			</div>
			<!-- Only the pin changes size. These hidden wraps reserve the full title's space. -->
			<div class="guide-topic-space" aria-hidden="true">
				<span>{title}</span><span class="guide-topic-compact">{title}</span>
			</div>

			{#if topic === 'spelling' && data.spellings}
				<!-- A landmark is a deep-link target exactly as an entry is: the index
		     lists it and every rule page's guideline link can name it, so it
		     takes the arrival wash through the same mark rather than through
		     `:target`, which only a native fragment navigation ever sets. -->
				<section
					class="guidelines__landmark"
					data-current={anchor === SPELLINGS_ANCHOR ? true : undefined}
				>
					<!-- The reviewed preferred-spellings list leads the topic page a reader
		     wondering about a spelling actually opens. Drawn from the same
		     `ruleLookupTable` the rule page loads (one data source, two surfaces),
		     and only the reviewed halves of it: the forms and the conditions the
		     guide itself states. What the linter does about each row (fix kinds,
		     LyricLint's own curated catches) stays on the rule's page, which is
		     what the sentence under the heading links. -->
					<header class="guidelines__entry-heading">
						<h2 id={SPELLINGS_ANCHOR}>The standardized spellings</h2>
						{#if spellingsLandmark}
							<!-- The entries' own meta idiom, in the section that leads the page:
				     the ladder, the tier, and the exact source the table is read
				     from. It carries no "Checked by" run, and that is the one
				     difference from an entry's line: the sentence directly beneath
				     already links `spelling.standardized`'s page in prose, and a
				     second link to it a line above would be the same command
				     offered twice on one surface. -->
							<div class="site-meta">
								<AuthorityLadder authority={spellingsLandmark.authority} />
								<span
									><GuidanceSearchHighlight
										text={authorityLabels[spellingsLandmark.authority]}
									/></span
								>
								<span class="site-meta__separator" aria-hidden="true">·</span>
								<SiteSourceFold sources={entrySources(spellingsLandmark.sourceIds)} text={marked} />
							</div>
						{/if}
					</header>
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
					{#if section.checksById['spelling.standardized']}
						<h3>What LyricLint checks</h3>
						{@render checkList([section.checksById['spelling.standardized']])}
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
					<header class="guidelines__entry-heading">
						<h2 id={entryAnchor(entry.id)}><GuidanceSearchHighlight text={entry.title} /></h2>
						<!-- The diagnostic card's own meta idiom: the tier, then the citation,
			     the exact source the claim is read from, whose section and verified
			     date are the link's tooltip. The tier label and the link are one
			     fact read together: the source is what makes the tier true. The
			     ladder ahead of the label draws that standing as ascending steps
			     (`AuthorityLadder.svelte`, `aria-hidden`, since the label is the fact).
			     A folded set still unfolds under the whole line rather than in the
			     middle of it, through the list's own flex `order`. -->
						<div class="site-meta">
							<AuthorityLadder authority={entry.authority} />
							<span><GuidanceSearchHighlight text={authorityLabels[entry.authority]} /></span>
							<span class="site-meta__separator" aria-hidden="true">·</span>
							<SiteSourceFold sources={entrySources(entry.sourceIds)} text={marked} />
						</div>
					</header>
					<!-- The forms a convention names (`[Verse 1]`, `gon'`, `'90s`) are
			     written in backticks in the entry and set in the code face here,
			     because a form left in the sentence's own type is a word of the
			     sentence: `and rather than an'` reads as a conjunction until the
			     face says it is being quoted. The catalog's own titles carry
			     none, since the index draws those as plain strings. -->
					<p><CodeProse text={entry.statement} mark={marked} /></p>
					<!-- The pair, incorrect first, in the rule pages' own order, with the color
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
					<!-- The note is the convention's own qualifications (where the rule
			     bends, which half the linter checks), not a colophon about the
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
							entry.relatedRuleIds.flatMap((id) =>
								section.checksById[id] ? [section.checksById[id]] : []
							)
						)}
					{/if}
				</section>
			{/each}

			{#if section.additionalChecks.length}
				<section class="guidelines__additional" aria-labelledby={`additional-checks-${topic}`}>
					<header class="guidelines__entry-heading">
						<h2 id={`additional-checks-${topic}`}>More checks for this topic</h2>
					</header>
					<p>
						These checks cover other patterns in this topic. Each explains its source, trigger, and
						suggested correction.
					</p>
					{@render checkList(section.additionalChecks)}
				</section>
			{/if}
		</section>
	{/each}

	<div class="site-actions">
		<a class="button" href={resolve('/workbench/')}>Check a transcription in the workbench</a>
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
