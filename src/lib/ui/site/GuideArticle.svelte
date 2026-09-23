<script module lang="ts">
	export type GuideReadingSnapshot = { checks: number[]; detailY: number; windowY: number };
</script>

<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- referenceHref only adds URL state to base-prefixed or resolve-derived paths; the lint rule cannot inspect nested calls. */
	import { tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { base, resolve } from '$app/paths';
	import {
		createReferenceResults,
		referenceSearchQuery,
		referenceHref
	} from '$lib/ui/site/reference-search.svelte.js';
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

	const search = $derived(createReferenceResults(data.referenceCorpus));
	const searching = $derived(referenceSearchQuery().trim().length > 0);
	type Section = LayoutData['sections'][number];
	type Entry = ReturnType<typeof guidanceTopics>[number]['entries'][number];
	type Item =
		| { kind: 'entry'; entry: Entry }
		| { kind: 'landmark' }
		| { kind: 'check'; check: Section['additionalChecks'][number] };
	const groups = $derived.by(() => {
		const catalog = data.sections.map((section) => ({
			section,
			items: [
				...(section.topic === 'spelling' ? [{ kind: 'landmark' as const }] : []),
				...guidanceTopics()
					.find((candidate) => candidate.topic === section.topic)!
					.entries.map((entry) => ({ kind: 'entry' as const, entry }))
			]
		}));
		if (!searching) return catalog.map((group) => ({ ...group, key: group.section.topic }));
		const ranked: { section: Section; items: Item[]; key: string }[] = [];
		for (const result of search()) {
			const source = catalog.find((group) => group.section.topic === result.topic);
			if (!source) continue;
			const check = data.sections.map((section) => section.checksById[result.id]).find(Boolean);
			const item: Item | undefined =
				result.kind === 'rule'
					? check
						? { kind: 'check', check }
						: undefined
					: source.items.find((item) =>
							item.kind === 'entry'
								? item.entry.id === result.id
								: result.href.endsWith('#standardized-spellings')
						);
			if (!item) continue;
			const previous = ranked.at(-1);
			if (previous?.section.topic === source.section.topic) previous.items.push(item);
			else ranked.push({ section: source.section, items: [item], key: result.id });
		}
		return ranked;
	});

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

	let previousQuery: string | undefined;
	$effect(() => {
		const query = referenceSearchQuery();
		if (previousQuery !== undefined && query !== previousQuery) {
			void tick().then(() => {
				const detail = article?.closest<HTMLElement>('.site-split__detail');
				if (detail) detail.scrollTop = 0;
				spy();
			});
		}
		previousQuery = query;
	});

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
					<!-- A check's sources are often not the convention's own, so they
					     stand under the summary in the entry heading's meta idiom rather
					     than one link away on the check page. -->
					<div class="site-meta">
						<SiteSourceFold sources={check.sources} text={marked} />
					</div>
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

{#snippet spellings(section: Section)}
	{#if data.spellings}
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
							><GuidanceSearchHighlight text={authorityLabels[spellingsLandmark.authority]} /></span
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
{/snippet}

{#snippet convention(entry: Entry, section: Section)}
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
{/snippet}

<main
	id="main"
	tabindex="-1"
	class="site-prose site-split__page"
	bind:this={article}
	use:stickyTopics={groups}
>
	<div class="guide-glass" aria-hidden="true"></div>
	<h1>Transcription guide</h1>
	<p class="site-lede">Reviewed conventions, examples, and the sources behind them.</p>
	<p>
		The checks below catch specific patterns in your text. They support your review; passing them
		does not verify every part of a convention.
	</p>
	{#if searching && groups.length === 0}
		<p class="site-index__empty">
			No results match. Try a shorter phrase, another topic, or clear the filters.
		</p>
	{/if}
	{#each groups as group, groupIndex (group.key)}
		{@const section = group.section}
		{@const topic = section.topic}
		{@const firstItem = group.items[0]}
		{@const topicId = `topic-${topic}${groups.slice(0, groupIndex).some((group) => group.section.topic === topic) ? `-${groupIndex}` : ''}`}
		{@const title =
			referenceTopics.find((item) => item.id === topic)?.title ?? guidanceTopicTitles[topic]}
		<section
			class="guide-topic"
			aria-labelledby={topicId}
			data-reading-anchor={firstItem?.kind === 'landmark'
				? SPELLINGS_ANCHOR
				: firstItem?.kind === 'entry'
					? entryAnchor(firstItem.entry.id)
					: ''}
		>
			<div class="guide-topic-pin">
				<h2 class="guide-topic-title guidelines__topic" id={topicId}>{title}</h2>
			</div>
			<!-- Only the pin changes size. These hidden wraps reserve the full title's space. -->
			<div class="guide-topic-space" aria-hidden="true">
				<span>{title}</span><span class="guide-topic-compact">{title}</span>
			</div>

			{#each group.items as item (item.kind === 'entry' ? item.entry.id : item.kind === 'check' ? item.check.id : SPELLINGS_ANCHOR)}
				{#if item.kind === 'entry'}
					{@render convention(item.entry, section)}
				{:else if item.kind === 'landmark'}
					{@render spellings(section)}
				{:else}
					<section class="guidelines__entry guidelines__check-result">
						<header class="guidelines__entry-heading"><h2>{item.check.title}</h2></header>
						{@render checkList([item.check])}
					</section>
				{/if}
			{/each}

			{#if !searching && section.additionalChecks.length}
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
	.guidelines__entry-heading {
		position: sticky;
		inset-block-start: var(--topic-compact-height, 0px);
		z-index: 2;
		margin-inline: calc(-1 * var(--split-lane-start)) calc(-1 * var(--split-lane-end));
		padding: var(--space-2) var(--split-lane-end) var(--space-2) var(--split-lane-start);
	}

	.guide-topic:global([data-stuck]) .guidelines__entry-heading {
		clip-path: inset(var(--heading-clip, 0px) 0 0);
	}

	.guidelines__entry-heading > h2,
	.guidelines__entry-heading > .site-meta {
		margin-block-start: 0;
		margin-block-end: var(--space-1-5);
	}

	/* Every guidance entry is a deep-link target (the index and the assistant both
	   name entries by fragment), and on a wide screen the masthead travels with the
	   reader, so a jumped-to heading has to clear it or the one line the link named
	   is the line under the chrome. (The page's own landing re-centers it; this is
	   the no-JavaScript fallback's clearance.) */
	.guidelines__entry-heading > h2 {
		margin-bottom: var(--space-1-5);
		/* Match the pinned text edge so native fragment alignment preserves Back restoration. */
		scroll-margin-top: calc(var(--topic-compact-height, 0px) + var(--space-2));
	}

	.guidelines__additional {
		margin-block-start: var(--space-7);
	}

	/* Where one section ends and the next begins: the hairline the linter's run
	   draws between neighbours. Every section opens on one. Drawn only between
	   entries, the first convention ran straight on from the topic's own lede
	   with nothing saying where the intro stopped and the catalog began, and the
	   spelling topic's landmark met its first entry the same way. The last entry
	   still closes on nothing, because what follows it is not another section: a
	   line under it would separate it from the heading that already separates
	   itself. */
	.guidelines__entry,
	.guidelines__landmark {
		border-top: var(--border-width) solid var(--color-border);
		margin-top: var(--space-6);
		padding-top: var(--space-6);
	}

	/* A section owns its own rhythm: the prose gap its heading used to carry moves
	   onto the section, and the first and last children give their margins up.
	   Read at rest this is the same page to the pixel: what it buys is the wash
	   below, whose background paints the section's box, child margins included: a
	   heading still carrying its own top margin put a hand of empty blue above
	   the one line the link named. The landmark keeps the same rhythm, because it
	   takes the same wash. */
	.guidelines__entry > :first-child,
	.guidelines__landmark > :first-child {
		margin-top: 0;
	}

	.guidelines__entry > :last-child,
	.guidelines__landmark > :last-child {
		margin-bottom: 0;
	}

	/* The entry a deep link landed on, washed in the selection tone for as long
	   as the hash names it. The page marks it (`data-current`, read off the hash),
	   because `:target` cannot carry this alone: only a native fragment navigation
	   updates the target element, and pressing an index row from another page is
	   the router's `pushState`, which updates nothing, so the wash skipped the
	   first press and lit only on same-path hash presses. `:target` stays in the
	   selector as the no-JavaScript arrival's mark, handed to the whole entry by
	   `:has()`. The wash is a pseudo-element floated behind the content rather
	   than the entry's own background: the entry's box reaches to the hairlines,
	   so a background would lie against both lines, and the shape wanted is a
	   line, a breath, the box, a breath, a line. The box spills `--space-4` past
	   the content on every side, and where a hairline sits `--space-6` off the
	   content it therefore stops `--space-4` short of the line, the same even
	   gap above and below. The article scopes the negative layer, leaving each
	   sticky entry header above the pane's shared glass plane.

	   A landmark is a deep-link target exactly as an entry is (the index and every
	   rule page's guideline link both name its anchor), so it takes the same wash
	   through the same pair of marks. One mechanism: the page sets the same
	   `data-current`, and `:target` is the same no-JavaScript fallback. */
	.guidelines__entry[data-current],
	.guidelines__entry:has(:target),
	.guidelines__landmark[data-current],
	.guidelines__landmark:has(:target) {
		position: relative;
	}

	.guidelines__entry[data-current]::before,
	.guidelines__entry:has(:target)::before,
	.guidelines__landmark[data-current]::before,
	.guidelines__landmark:has(:target)::before {
		content: '';
		position: absolute;
		z-index: -1;
		inset: calc(-1 * var(--space-4));
		/* Every section opens on a hairline `--space-6` above its content, so the
		   spill that would otherwise cross it is pulled back to the same
		   `--space-4` breath the wash keeps on every other side of the line. */
		top: calc(var(--space-6) - var(--space-4));
		border-radius: var(--radius-panel);
		background: var(--color-selected);
	}

	@media (max-width: 62rem) {
		/* The index sits offscreen on phones, so the arrival heading is enough. */
		.guidelines__entry[data-current]::before,
		.guidelines__entry:has(:target)::before,
		.guidelines__landmark[data-current]::before,
		.guidelines__landmark:has(:target)::before {
			content: none;
		}
	}

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
