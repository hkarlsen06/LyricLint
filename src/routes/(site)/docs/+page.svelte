<script lang="ts">
	import { resolve } from '$app/paths';
	import { docsGroups, docsPagesIn } from '$lib/docs/catalog.js';
	import { siteUrl } from '$lib/seo.js';
	import * as Card from '$lib/ui/primitives/card/index.js';

	const pageTitle = 'Docs · LyricLint';
	const pageDescription =
		"How LyricLint works: 'scribes, section headers, performers, findings, audio, sync, and every shortcut.";
	const canonicalUrl = siteUrl('/docs/');

	const groupId = (group: string) => group.toLowerCase().replaceAll(' ', '-');
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
</svelte:head>

<main id="main" tabindex="-1" class="site-prose docs-index">
	<h1>LyricLint docs</h1>
	<p class="site-lede">Short pages on how the workbench behaves, from your first 'scribe onward.</p>

	{#each docsGroups as group (group)}
		<h2 id={groupId(group)}>{group}</h2>
		<ul class="docs-index__cards">
			{#each docsPagesIn(group) as page (page.slug)}
				<li>
					<!-- One link per card, stretched over it, so the card is one press and
					     the link's name is the title alone. -->
					<Card.Root class="docs-index__card">
						<Card.Title>
							<a href={resolve(`/docs/${page.slug}/`)}>{page.title}</a>
						</Card.Title>
						<Card.Description>{page.summary}</Card.Description>
					</Card.Root>
				</li>
			{/each}
		</ul>
	{/each}

	<p class="docs-index__guide">
		Genius's conventions, and the check behind every finding, are in the
		<a href={resolve('/guidelines/')}>transcription guide</a>.
	</p>
</main>

<style>
	.docs-index {
		max-width: var(--measure-prose);
	}

	.docs-index__cards {
		display: grid;
		margin: 0;
		padding: 0;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: var(--space-3);
		list-style: none;
	}

	.docs-index__cards li {
		display: grid;
		margin: 0;
	}

	.docs-index__cards :global(.docs-index__card) {
		position: relative;
	}

	.docs-index__cards :global(.docs-index__card:hover) {
		background: var(--color-fill-subtle);
	}

	.docs-index__cards a {
		color: var(--color-text);
		text-decoration: none;
	}

	.docs-index__cards a::after {
		position: absolute;
		border-radius: inherit;
		content: '';
		inset: 0;
	}

	/* The ring goes around the card the link stands for, not around its title. */
	.docs-index__cards a:focus-visible {
		outline: none;
	}

	.docs-index__cards :global(.docs-index__card:has(a:focus-visible)) {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	.docs-index__guide {
		margin-block-start: var(--space-7);
	}

	@media (prefers-reduced-motion: no-preference) {
		.docs-index__cards :global(.docs-index__card) {
			transition: background-color var(--duration-fast) var(--ease-out-quart);
		}
	}
</style>
