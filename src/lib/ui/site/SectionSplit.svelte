<script lang="ts">
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import { referenceHref, referenceSearchState } from './reference-search.svelte.js';

	let { detailOpen, list, children }: { detailOpen: boolean; list: Snippet; children: Snippet } =
		$props();
	const filters = $derived(referenceSearchState());
	const hasSearch = $derived(
		!!filters.query.trim() || filters.scope !== 'all' || !!filters.topic || filters.browseAll
	);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (The directory landmark is a programmatic skip-link target, never a tab stop.) -->
<div
	class="guide-layout"
	class:guide-layout--article={detailOpen}
	role={detailOpen ? undefined : 'main'}
	id={detailOpen ? undefined : 'main'}
	tabindex={detailOpen ? undefined : -1}
>
	{#if !detailOpen}
		<header class="guide-heading">
			<h1>Transcription guide</h1>
			<p>Practical answers for writing lyrics on Genius. Start with the part you are working on.</p>
		</header>
	{/if}
	<aside class="guide-sidebar" aria-label="Find transcription advice">
		{@render list()}
	</aside>
	<div class="guide-reader site-split__detail">
		{#if detailOpen}
			<nav class="guide-return" aria-label="Guide navigation">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Keeps the existing search on the resolved directory route. -->
				<a class="button button--quiet" href={referenceHref(`${resolve('/(site)/guidelines')}/`)}>
					<ArrowLeftIcon size={16} aria-hidden="true" />
					{hasSearch ? 'Back to results' : 'All topics'}
				</a>
			</nav>
		{/if}
		{@render children()}
	</div>
</div>

<style>
	.guide-layout {
		display: grid;
		grid-template-columns: minmax(16rem, 21rem) minmax(0, 1fr);
		gap: var(--space-8);
		width: 100%;
		max-width: var(--measure-split);
		margin-inline: auto;
		padding: var(--space-7) var(--space-5) var(--space-8);
		align-items: start;
	}
	.guide-layout:not(.guide-layout--article) {
		grid-template-rows: auto 1fr;
		row-gap: var(--space-6);
	}
	.guide-heading {
		grid-column: 2;
	}
	.guide-layout:not(.guide-layout--article) .guide-sidebar {
		grid-column: 1;
		grid-row: 1 / span 2;
	}
	.guide-heading h1 {
		font-size: var(--font-size-2xl);
		line-height: var(--line-height-tight);
		margin: 0 0 var(--space-3);
	}
	.guide-heading p {
		margin: 0;
		line-height: var(--line-height-body);
		max-width: var(--measure-prose);
	}
	.guide-sidebar {
		position: sticky;
		top: calc(var(--header-height) + var(--space-7));
		max-height: calc(100dvh - var(--header-height) - var(--space-7) - var(--space-5));
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		padding-inline-end: var(--space-4);
	}
	.guide-reader {
		min-width: 0;
	}
	.guide-return {
		margin-bottom: var(--space-5);
	}
	.guide-return a {
		text-decoration: none;
	}
	@media (max-width: 62rem) {
		.guide-layout {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-7);
			padding-top: var(--space-5);
		}
		.guide-layout:not(.guide-layout--article) {
			grid-template-rows: none;
			row-gap: var(--space-7);
		}
		.guide-heading,
		.guide-layout:not(.guide-layout--article) .guide-sidebar {
			grid-column: auto;
			grid-row: auto;
		}
		.guide-sidebar {
			position: static;
			max-height: none;
			overflow: visible;
			padding: 0;
		}
		.guide-layout--article .guide-sidebar {
			display: none;
		}
	}
</style>
