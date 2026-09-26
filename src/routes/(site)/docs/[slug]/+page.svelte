<script lang="ts">
	import { resolve } from '$app/paths';
	import { docsNeighbors, docsPage } from '$lib/docs/catalog.js';
	import { siteUrl } from '$lib/seo.js';
	import StructuredData from '$lib/ui/site/StructuredData.svelte';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();

	// The loader has already refused a slug the catalog does not have.
	const doc = $derived(docsPage(data.slug)!);
	const neighbors = $derived(docsNeighbors(data.slug));
	const pageTitle = $derived(`${doc.title} · LyricLint docs`);
	const canonicalUrl = $derived(siteUrl(`/docs/${doc.slug}/`));
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'TechArticle',
		headline: doc.title,
		description: doc.summary,
		url: canonicalUrl,
		isPartOf: { '@type': 'WebSite', name: 'LyricLint', url: siteUrl('/') },
		about: { '@type': 'SoftwareApplication', name: 'LyricLint', url: siteUrl('/workbench/') }
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={doc.summary} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="article" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={doc.summary} />
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={doc.summary} />
</svelte:head>

<StructuredData data={structuredData} />

<main id="main" tabindex="-1" class="docs-page">
	<div class="docs-page__column">
		<article class="site-prose docs-page__article">
			<h1>{doc.title}</h1>
			<p class="site-lede">{doc.summary}</p>
			<data.Content />
		</article>

		{#if neighbors.previous || neighbors.next}
			<nav class="docs-pager" aria-label="Previous and next page">
				{#if neighbors.previous}
					<a
						class="docs-pager__link"
						rel="prev"
						href={resolve(`/docs/${neighbors.previous.slug}/`)}
					>
						<span class="docs-pager__direction">Previous</span>
						<span class="docs-pager__title">{neighbors.previous.title}</span>
					</a>
				{/if}
				{#if neighbors.next}
					<a
						class="docs-pager__link docs-pager__link--next"
						rel="next"
						href={resolve(`/docs/${neighbors.next.slug}/`)}
					>
						<span class="docs-pager__direction">Next</span>
						<span class="docs-pager__title">{neighbors.next.title}</span>
					</a>
				{/if}
			</nav>
		{/if}
	</div>

	<nav class="docs-toc" aria-labelledby="docs-toc-title">
		<p class="docs-toc__title" id="docs-toc-title">On this page</p>
		<ul>
			{#each doc.sections as section (section.id)}
				<li><a href="#{section.id}">{section.title}</a></li>
			{/each}
		</ul>
	</nav>
</main>

<style>
	/* The "On this page" list takes a column of its own only where the article
	   keeps its full measure beside it; narrower, the sidebar and the headings
	   already carry the page. */
	.docs-page {
		display: grid;
		grid-template-columns: minmax(0, var(--measure-prose));
		column-gap: var(--space-7);
		align-items: start;
	}

	.docs-page__column {
		min-width: 0;
	}

	/* A fragment jump lands the heading under the sticky masthead, not behind it. */
	.docs-page__article :global(h2[id]),
	.docs-page__article :global(h3[id]) {
		scroll-margin-top: calc(var(--header-height) + var(--space-4));
	}

	.docs-pager {
		display: grid;
		margin-block-start: var(--space-7);
		padding-block-start: var(--space-5);
		border-block-start: var(--border-width) solid var(--color-border);
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
	}

	.docs-pager__link {
		display: grid;
		padding: var(--space-3);
		border-radius: var(--radius-panel);
		gap: var(--space-1);
		align-content: start;
		color: var(--color-text);
		text-decoration: none;
	}

	.docs-pager__link:hover {
		background: var(--color-fill-subtle);
		color: var(--color-text);
	}

	.docs-pager__link--next {
		grid-column: 2;
		text-align: end;
	}

	.docs-pager__direction {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.docs-pager__title {
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}

	.docs-toc {
		display: none;
	}

	@media (min-width: 72rem) {
		.docs-page {
			grid-template-columns: minmax(0, var(--measure-prose)) minmax(0, 1fr);
		}

		.docs-toc {
			position: sticky;
			display: block;
			inset-block-start: var(--header-height);
			padding-block-start: var(--space-2);
			font-size: var(--font-size-sm);
		}
	}

	.docs-toc__title {
		margin: 0 0 var(--space-2);
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}

	.docs-toc ul {
		display: grid;
		margin: 0;
		padding: 0;
		gap: var(--space-2);
		list-style: none;
	}

	.docs-toc a {
		color: var(--color-text-muted);
		line-height: var(--line-height-tight);
		text-decoration: none;
	}

	.docs-toc a:hover {
		color: var(--color-text);
	}
</style>
