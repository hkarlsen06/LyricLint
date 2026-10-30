<script module lang="ts">
	export type GuideReadingSnapshot = { checks: string[]; contentsOpen: boolean; windowY: number };
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import { referenceHref } from '#lib/ui/site/reference-search.svelte.js';
	import { guidanceTopics } from '#lib/guidance/entries.js';
	import {
		authorityLabels,
		entryAnchor,
		guidanceTopicLandmarks,
		guidanceTopicTitles
	} from '#lib/guidance/guidance.js';
	import { getSource } from '#lib/rules/data/sources.js';
	import { referenceTopics } from '#lib/reference/topics.js';
	import AuthorityLadder from '#lib/ui/site/AuthorityLadder.svelte';
	import CodeProse from '#lib/ui/site/CodeProse.svelte';
	import GuidanceSearchHighlight from '#lib/ui/site/GuidanceSearchHighlight.svelte';
	import SiteSourceFold from '#lib/ui/site/SiteSourceFold.svelte';
	import GuidanceConvention from '#lib/ui/site/GuidanceConvention.svelte';
	import type { Snapshot } from '@sveltejs/kit';
	import type { LayoutData } from '../../../routes/(site)/guidelines/$types.js';
	import type { GuidanceTopic } from '#lib/guidance/guidance.js';
	let { data, topic }: { data: LayoutData; topic?: GuidanceTopic } = $props();
	const root = resolve('/(site)');
	type Section = LayoutData['sections'][number];
	type Entry = ReturnType<typeof guidanceTopics>[number]['entries'][number];
	const groups = $derived(
		data.sections
			.filter((section) => !topic || section.topic === topic)
			.map((section) => ({
				section,
				entries: guidanceTopics().find((group) => group.topic === section.topic)?.entries ?? []
			}))
	);
	const title = $derived(topic ? topicTitle(topic) : 'Complete Genius transcription guide');
	function topicTitle(value: GuidanceTopic) {
		return referenceTopics.find((item) => item.id === value)?.title ?? guidanceTopicTitles[value];
	}
	const SPELLINGS_ANCHOR = 'standardized-spellings';
	let article: HTMLElement;
	export const snapshot: Snapshot<GuideReadingSnapshot> = {
		capture: () => ({
			checks: Array.from(
				article.querySelectorAll<HTMLDetailsElement>('details[data-check-id]')
			).flatMap((element) => (element.open ? [element.id] : [])),
			contentsOpen: article.querySelector<HTMLDetailsElement>('.guide-contents')?.open ?? false,
			windowY: window.scrollY
		}),
		restore: (saved) => {
			const restoredUrl = location.href;
			const contents = article.querySelector<HTMLDetailsElement>('.guide-contents');
			if (contents) contents.open = saved.contentsOpen;
			article.querySelectorAll<HTMLDetailsElement>('details[data-check-id]').forEach((element) => {
				element.open = saved.checks.includes(element.id);
			});
			// Let disclosure layout and SvelteKit's own restoration finish first.
			void tick().then(() =>
				requestAnimationFrame(() =>
					requestAnimationFrame(() => {
						if (location.href === restoredUrl && article.isConnected)
							window.scrollTo(0, saved.windowY);
					})
				)
			);
		}
	};
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

	const spellingsLandmark = $derived(
		guidanceTopicLandmarks.spelling?.find(
			(landmark) => entryAnchor(landmark.id) === SPELLINGS_ANCHOR
		)
	);
</script>

{#snippet marked(value: string)}<GuidanceSearchHighlight text={value} />{/snippet}

{#snippet checkList(
	owner: string,
	checks: readonly LayoutData['sections'][number]['additionalChecks'][number][]
)}
	<ul class="guidelines__checks">
		{#each checks as check (check.href)}
			<li>
				<details id={`check-${owner}-${check.id}`} class="site-disclosure" data-check-id={check.id}>
					<summary
						><span class="site-disclosure__label"
							><GuidanceSearchHighlight text={check.title} /></span
						><CaretDownIcon
							class="site-disclosure__chevron"
							size={16}
							aria-hidden="true"
						/></summary
					>

					<div class="site-meta">
						{#each check.sources as source (source.id)}<SiteSourceFold
								sources={[source]}
								text={marked}
							/>{/each}
					</div>
					<figure class="site-sample site-sample--valid">
						<figcaption class="site-sample__label">Accepted by this check</figcaption>
						<pre
							class="site-sample__text"
							lang={check.language}
							dir={check.language === 'ar' ? 'rtl' : undefined}><GuidanceSearchHighlight
								text={check.valid}
							/></pre>
					</figure>
					<figure class="site-sample site-sample--invalid">
						<figcaption class="site-sample__label">Flagged example</figcaption>
						<pre
							class="site-sample__text"
							lang={check.language}
							dir={check.language === 'ar' ? 'rtl' : undefined}><GuidanceSearchHighlight
								text={check.invalid}
							/></pre>
					</figure>
					<p><CodeProse text={check.explanation} mark={marked} glossary /></p>
					<!-- eslint-disable svelte/no-navigation-without-resolve -- referenceHref decorates a resolve() URL with shared search parameters. -->
					<p>
						<a
							href={referenceHref(`${root}${check.href.slice(1)}`)}
							aria-label={`See trigger and fix: ${check.title}`}>See trigger and fix</a
						>
					</p>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</details>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet spellings(section: Section)}
	{#if data.spellings}
		<section class="guidelines__landmark">
			<header class="guidelines__entry-heading">
				<svelte:element this={topic ? 'h2' : 'h3'} id={SPELLINGS_ANCHOR}
					>The standardized spellings</svelte:element
				>
				{#if spellingsLandmark}
					<div class="site-meta">
						<AuthorityLadder authority={spellingsLandmark.authority} />
						<span
							><GuidanceSearchHighlight text={authorityLabels[spellingsLandmark.authority]} /></span
						>
						<span class="site-meta__separator" aria-hidden="true">·</span>
						{#each entrySources(spellingsLandmark.sourceIds) as source (source.id)}<SiteSourceFold
								sources={[source]}
								text={marked}
							/>{/each}
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
							<p class="rules__lookup-note">
								<CodeProse text={sentence!} mark={marked} glossary />
							</p>
						{/each}
					</li>
				{/each}
			</ul>
			{#if section.checksById['spelling.standardized']}
				<svelte:element this={topic ? 'h3' : 'h4'}>What LyricLint checks</svelte:element>
				{@render checkList(SPELLINGS_ANCHOR, [section.checksById['spelling.standardized']])}
			{/if}
		</section>
	{/if}
{/snippet}

{#snippet convention(entry: Entry, section: Section)}
	<section class="guidelines__entry">
		<svelte:element this={topic ? 'h2' : 'h3'} id={entryAnchor(entry.id)}
			><GuidanceSearchHighlight text={entry.title} /></svelte:element
		>
		<GuidanceConvention {entry} />
		{#if entry.relatedRuleIds?.length}
			<svelte:element this={topic ? 'h3' : 'h4'}>What LyricLint checks</svelte:element>
			{@render checkList(
				entry.id,
				entry.relatedRuleIds.flatMap((id) =>
					section.checksById[id] ? [section.checksById[id]] : []
				)
			)}
		{/if}
	</section>
{/snippet}
<main id="main" tabindex="-1" class="site-prose site-split__page" bind:this={article}>
	<h1 id={topic ? `topic-${topic}` : undefined}>{title}</h1>
	<p class="site-lede">
		{topic
			? referenceTopics.find((item) => item.id === topic)?.question
			: 'Every reviewed convention, with examples and links to its sources.'}
	</p>
	<details
		class="guide-contents site-disclosure"
		open={!topic || groups.reduce((count, group) => count + group.entries.length, 0) <= 8}
	>
		<summary
			><span class="site-disclosure__label">{topic ? 'In this topic' : 'Contents'}</span
			><CaretDownIcon class="site-disclosure__chevron" size={16} aria-hidden="true" /></summary
		>
		<nav aria-label="On this page">
			<ul>
				{#each groups as group (group.section.topic)}
					{#if !topic}<li>
							<a href={`#topic-${group.section.topic}`}>{topicTitle(group.section.topic)}</a>
						</li>{/if}
					{#if topic}
						{#if topic === 'spelling'}<li>
								<a href="#standardized-spellings">The standardized spellings</a>
							</li>{/if}
						{#each group.entries as entry (entry.id)}<li>
								<a href={`#${entryAnchor(entry.id)}`}>{entry.title}</a>
							</li>{/each}
						{#if group.section.additionalChecks.length}<li>
								<a href={`#additional-checks-${topic}`}>More checks for this topic</a>
							</li>{/if}
					{/if}
				{/each}
			</ul>
		</nav>
	</details>
	{#each groups as group (group.section.topic)}
		<section class="guide-topic" aria-label={topicTitle(group.section.topic)}>
			{#if !topic}<h2 id={`topic-${group.section.topic}`}>
					{topicTitle(group.section.topic)}
				</h2>{/if}
			{#if group.section.topic === 'spelling'}{@render spellings(group.section)}{/if}
			{#each group.entries as entry (entry.id)}{@render convention(entry, group.section)}{/each}
			{#if group.section.additionalChecks.length}
				<section class="guidelines__additional">
					<svelte:element this={topic ? 'h2' : 'h3'} id={`additional-checks-${group.section.topic}`}
						>More checks for this topic</svelte:element
					>
					<p>
						These checks cover other patterns in this topic. Each explains its source, trigger, and
						suggested correction.
					</p>
					{@render checkList(`additional-${group.section.topic}`, group.section.additionalChecks)}
				</section>
			{/if}
		</section>
	{/each}
	<nav class="guide-related" aria-label="Continue reading">
		<h2>Explore other topics</h2>
		<ul>
			<!-- eslint-disable svelte/no-navigation-without-resolve -- referenceHref preserves search on resolved URLs. -->
			{#each referenceTopics.filter((item) => item.id !== topic) as related (related.id)}
				<li>
					<a href={referenceHref(resolve('/(site)/guidelines/[topic]', { topic: related.id }))}
						>{related.title}</a
					>
				</li>
			{/each}
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</ul>
	</nav>
	<p class="guide-check-note">
		LyricLint checks catch specific patterns in your text. Passing them does not verify every part
		of a convention.
	</p>
	<div class="site-actions">
		<a class="button" href={resolve('workbench/')}>Check a transcription in the workbench</a>
	</div>
</main>

<style>
	.guidelines__entry,
	.guidelines__landmark,
	.guidelines__additional,
	.guide-related {
		border-top: var(--border-width) solid var(--color-border);
		margin-top: var(--space-7);
		padding-top: var(--space-6);
	}
	.guidelines__entry > :target,
	.guidelines__landmark :target {
		position: relative;
	}
	.guidelines__entry > :target::before,
	.guidelines__landmark :target::before {
		content: '';
		position: absolute;
		inset-block: 0;
		left: calc(-1 * var(--space-3));
		width: var(--focus-ring-width);
		background: var(--color-text);
	}
	h1,
	h2,
	h3,
	h4 {
		scroll-margin-top: calc(var(--header-height) + var(--space-6));
	}
	.guidelines__entry > :first-child,
	.guidelines__landmark > :first-child {
		margin-top: 0;
	}
	.guidelines__entry > :last-child,
	.guidelines__landmark > :last-child {
		margin-bottom: 0;
	}
	.guidelines__checks {
		list-style: none;
		padding: 0;
		margin: var(--space-3) 0 0;
	}
	/* One run of disclosure rows: neighbours share a hairline. */
	.guidelines__checks li {
		margin: 0;
	}
	.guidelines__checks li + li > details {
		border-block-start: 0;
	}
	.guidelines__checks p {
		margin: var(--space-1) 0 0;
	}
	.guide-contents ul {
		margin-block-end: 0;
	}
	nav li + li {
		margin-top: var(--space-2);
	}
	.guide-topic {
		min-width: 0;
		margin-block-start: var(--space-6);
	}
	.guide-topic > .guidelines__entry:first-child,
	.guide-topic > .guidelines__landmark:first-child {
		border-top: 0;
		margin-top: 0;
		padding-top: 0;
	}
</style>
