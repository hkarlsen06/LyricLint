<script lang="ts">
	/**
	 * The docs' frame, inside the site's document shell: a sticky contents
	 * sidebar beside the page on a wide screen, and on a narrow one a single
	 * Contents control that opens the same list in a sheet. The search dialog
	 * belongs to the frame, so `Mod-K` and `/` answer on every docs page.
	 */
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import ListIcon from 'phosphor-svelte/lib/ListIcon';
	import DocsNav from '$lib/ui/docs/DocsNav.svelte';
	import DocsSearch from '$lib/ui/docs/DocsSearch.svelte';
	import * as Sheet from '$lib/ui/primitives/sheet/index.js';

	let { children } = $props();

	let searchOpen = $state(false);
	let contentsOpen = $state(false);
	const current = $derived(page.params.slug);

	// A page chosen from the sheet is where the reader was going; the sheet has
	// done its job.
	afterNavigate(() => {
		contentsOpen = false;
	});

	function openSearch(): void {
		contentsOpen = false;
		searchOpen = true;
	}
</script>

<div class="docs">
	<div class="docs__sidebar">
		<DocsNav {current} onSearch={openSearch} />
	</div>

	<div class="docs__bar">
		<Sheet.Root bind:open={contentsOpen}>
			<Sheet.Trigger class="button">
				<ListIcon aria-hidden="true" size="1em" />
				Contents
			</Sheet.Trigger>
			<Sheet.Content side="left">
				<Sheet.Header>
					<Sheet.Title>Contents</Sheet.Title>
				</Sheet.Header>
				<DocsNav {current} onSearch={openSearch} />
			</Sheet.Content>
		</Sheet.Root>
	</div>

	{@render children()}

	<DocsSearch bind:open={searchOpen} />
</div>

<style>
	/* The frame shares the masthead's container and gutter, so the sidebar's
	   edge is the wordmark's edge. */
	.docs {
		display: grid;
		width: 100%;
		max-width: var(--measure-split);
		margin-inline: auto;
		padding-inline: var(--space-5);
		grid-template-columns: 14rem minmax(0, 1fr);
		column-gap: var(--space-7);
		align-items: start;
	}

	/* Pinned under the sticky masthead and scrolled on its own when the list
	   outgrows the window. The inline padding keeps the search field's ring
	   inside the scroll port; the negative margin keeps its edge on the gutter. */
	.docs__sidebar {
		position: sticky;
		inset-block-start: var(--header-height);
		max-height: calc(100dvh - var(--header-height));
		margin-inline: calc(-1 * var(--space-1));
		padding: var(--space-7) var(--space-1) var(--space-5);
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}

	.docs__bar {
		display: none;
	}

	.docs > :global(main) {
		min-width: 0;
		padding-block: var(--space-7) var(--space-8);
	}

	@media (max-width: 56rem) {
		.docs {
			grid-template-columns: minmax(0, 1fr);
		}

		.docs__sidebar {
			display: none;
		}

		.docs__bar {
			display: flex;
			padding-block-start: var(--space-4);
		}

		.docs > :global(main) {
			padding-block-start: var(--space-5);
		}
	}
</style>
