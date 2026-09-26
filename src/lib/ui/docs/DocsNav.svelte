<script lang="ts">
	/**
	 * The docs' table of contents, drawn in the desktop sidebar and again inside
	 * the phone sheet. Groups and pages come from the catalog, so its order is the
	 * reading order the pager and the index follow.
	 */
	import { resolve } from '$app/paths';
	import { docsGroups, docsPagesIn } from '$lib/docs/catalog.js';
	import * as Kbd from '$lib/ui/primitives/kbd/index.js';
	import MagnifyingGlassIcon from 'phosphor-svelte/lib/MagnifyingGlassIcon';

	let { current, onSearch }: { current?: string; onSearch: () => void } = $props();

	// Two of these can be mounted at once (the sidebar and the sheet), so the
	// group labels' ids are per instance.
	const uid = $props.id();
</script>

<div class="docs-nav">
	<button
		type="button"
		class="button docs-nav__search"
		aria-keyshortcuts="Control+K Meta+K /"
		onclick={onSearch}
	>
		<MagnifyingGlassIcon aria-hidden="true" size="1em" />
		<span>Search the docs</span>
		<Kbd.Root class="docs-nav__hint" aria-hidden="true">/</Kbd.Root>
	</button>

	<nav aria-label="Documentation">
		{#each docsGroups as group, index (group)}
			<p class="docs-nav__group" id="{uid}-group-{index}">{group}</p>
			<ul aria-labelledby="{uid}-group-{index}">
				{#each docsPagesIn(group) as page (page.slug)}
					<li>
						<a
							href={resolve(`/docs/${page.slug}/`)}
							aria-current={page.slug === current ? 'page' : undefined}>{page.title}</a
						>
					</li>
				{/each}
			</ul>
		{/each}
	</nav>
</div>

<style>
	.docs-nav {
		display: grid;
		gap: var(--space-4);
	}

	/* Reads as the field it opens: the default tier's silhouette, its label at
	   the start and the key that also opens it at the end. */
	.docs-nav__search {
		width: 100%;
		justify-content: flex-start;
		color: var(--color-text-muted);
		font-weight: var(--font-weight-regular);
	}

	.docs-nav__search :global(.docs-nav__hint) {
		margin-inline-start: auto;
		color: var(--color-text-muted);
	}

	/* A touch screen has no key to hint at. */
	@media (pointer: coarse) {
		.docs-nav__search :global(.docs-nav__hint) {
			display: none;
		}
	}

	/* A label for the list under it, in sentence case at the list's own size. */
	.docs-nav__group {
		margin: var(--space-2) 0 var(--space-1);
		color: var(--color-text);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
	}

	ul {
		display: grid;
		margin: 0;
		padding: 0;
		gap: var(--space-0-5);
		list-style: none;
	}

	/*
	 * The current page is marked by a fill and a bar at its leading edge, and
	 * named by `aria-current`; neither the weight nor the size changes, so the
	 * list never rewraps as the reader moves through it. Hover takes the lighter
	 * fill without the bar, so the two never read alike.
	 */
	a {
		display: block;
		padding: var(--space-1-5) var(--space-3);
		border-radius: var(--radius-control);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-tight);
		text-decoration: none;
	}

	a:hover {
		background: var(--color-fill-subtle);
		color: var(--color-text);
	}

	a[aria-current='page'] {
		background: var(--color-fill);
		box-shadow: inset var(--space-0-5) 0 0 var(--color-accent);
		color: var(--color-text);
	}

	@media (pointer: coarse) {
		a {
			display: flex;
			min-height: var(--control-height-touch);
			align-items: center;
		}
	}
</style>
