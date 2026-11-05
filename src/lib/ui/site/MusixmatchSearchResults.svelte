<script module lang="ts">
	export type MusixmatchReadingSnapshot = { checks: number[]; detailY: number };
</script>

<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { createReferenceResults, referenceSearchQuery } from './reference-search.svelte.js';
	import { safeDecodeHash } from './hash.js';
	import { setReadingAnchor } from './guidance-reading.svelte.js';
	import MusixmatchClause from './MusixmatchClause.svelte';
	import MusixmatchCheck from './MusixmatchCheck.svelte';
	import type { LayoutData } from '../../../routes/(site)/guidelines/$types.js';
	import type { Snapshot } from '@sveltejs/kit';

	let { data }: { data: LayoutData } = $props();
	const search = $derived(createReferenceResults(data.musixmatchCorpus));
	type Item =
		| { kind: 'clause'; entry: LayoutData['musixmatchReader']['entries'][number] }
		| { kind: 'check'; check: LayoutData['musixmatchReader']['checks'][number] };
	const groups = $derived.by(() => {
		const groups: { key: string; topic: string; title: string; items: Item[] }[] = [];
		for (const result of search()) {
			let item: Item;
			if (result.kind === 'guideline') {
				const entry = data.musixmatchReader.entries.find((entry) => entry.id === result.id);
				if (!entry) continue;
				item = { kind: 'clause', entry };
			} else {
				const check = data.musixmatchReader.checks.find((check) => check.id === result.id);
				if (!check) continue;
				item = { kind: 'check', check };
			}
			const previous = groups.at(-1);
			if (previous?.topic === result.topic) previous.items.push(item);
			else
				groups.push({
					key: result.id,
					topic: result.topic,
					title: result.topicTitle,
					items: [item]
				});
		}
		return groups;
	});
	let article = $state<HTMLElement>();
	onDestroy(() => setReadingAnchor(''));
	let previousQuery: string | undefined;
	$effect(() => {
		const query = referenceSearchQuery();
		if (query !== previousQuery) {
			void tick().then(() => {
				const detail = article?.closest<HTMLElement>('.site-split__detail');
				if (detail) detail.scrollTop = 0;
			});
		}
		previousQuery = query;
	});
	afterNavigate(({ shallow, type }) => {
		if (shallow) return;
		const anchor = safeDecodeHash(location.hash.slice(1));
		setReadingAnchor(anchor);
		if (!anchor || type === 'popstate') return;
		requestAnimationFrame(() =>
			requestAnimationFrame(() => {
				const target = document.getElementById(anchor);
				const detail = article?.closest<HTMLElement>('.site-split__detail');
				if (target && detail)
					detail.scrollTop +=
						target.getBoundingClientRect().top - detail.getBoundingClientRect().top;
			})
		);
	});
	export const snapshot: Snapshot<MusixmatchReadingSnapshot> = {
		capture: () => ({
			checks: Array.from(
				article?.querySelectorAll<HTMLDetailsElement>('details[data-check-id]') ?? []
			).flatMap((element, index) => (element.open ? [index] : [])),
			detailY: article?.closest<HTMLElement>('.site-split__detail')?.scrollTop ?? 0
		}),
		restore: (saved) => {
			article
				?.querySelectorAll<HTMLDetailsElement>('details[data-check-id]')
				.forEach((element, index) => {
					element.open = saved.checks.includes(index);
				});
			requestAnimationFrame(() =>
				requestAnimationFrame(() => {
					const detail = article?.closest<HTMLElement>('.site-split__detail');
					if (detail) detail.scrollTop = saved.detailY;
				})
			);
		}
	};
</script>

<main id="main" tabindex="-1" class="site-prose site-split__page" bind:this={article}>
	<h1>Musixmatch search results</h1>
	{#if groups.length === 0}
		<p class="site-index__empty">
			No results match. Try a shorter phrase, another topic, or clear the filters.
		</p>
	{:else}
		{#each groups as group (group.key)}
			<section class="musixmatch-search-topic" aria-label={group.title}>
				<h2 class="musixmatch-search-topic__title">{group.title}</h2>
				{#each group.items as item (item.kind === 'clause' ? item.entry.id : item.check.id)}
					{#if item.kind === 'clause'}
						<MusixmatchClause entry={item.entry} />
					{:else}
						<section class="musixmatch-check-result">
							<h2>{item.check.title}</h2>
							<MusixmatchCheck check={item.check} />
						</section>
					{/if}
				{/each}
			</section>
		{/each}
	{/if}
</main>

<style>
	.musixmatch-search-topic__title {
		font-size: var(--font-size-2xl);
		font-weight: var(--font-weight-bold);
		color: var(--color-warning);
	}
	.musixmatch-check-result {
		margin-block: var(--space-7);
	}
</style>
