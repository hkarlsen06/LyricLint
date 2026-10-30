<script lang="ts">
	import { resolve } from '$app/paths';
	import { guidanceEntries } from '#lib/guidance/entries.js';
	import { authorityLabels, entryAnchor } from '#lib/guidance/guidance.js';
	import { getSource } from '#lib/rules/data/sources.js';
	import { referenceHref } from './reference-search.svelte.js';
	import SiteSourceFold from './SiteSourceFold.svelte';

	let { examples = false }: { examples?: boolean } = $props();
	const questions = [
		{ label: 'How do I label song sections?', id: 'guidance.section-headers.bracketed-headers' },
		{
			label: 'How do I credit different singers?',
			id: 'guidance.section-headers.artist-identifiers'
		},
		{ label: 'What if I cannot hear a word?', id: 'guidance.censored-unknown.unknown-marker' },
		{ label: 'How do I write ad-libs?', id: 'guidance.ad-libs.include-every' }
	].flatMap((question) =>
		guidanceEntries
			.filter((entry) => entry.id === question.id)
			.map((entry) => ({ ...question, entry }))
	);
</script>

<div class:guide-questions--examples={examples} class="guide-questions">
	<h2>Common questions</h2>
	<ul>
		{#each questions as { label, entry } (entry.id)}
			<li>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- Keeps search on a resolved canonical entry link. -->
				<a
					href={referenceHref(
						`${resolve('/(site)/guidelines/[topic]', { topic: entry.topic })}/#${entryAnchor(entry.id)}`
					)}>{label}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{#if examples}
					<figure class="site-sample site-sample--valid">
						<figcaption class="site-sample__label">Example</figcaption>
						<pre class="site-sample__text">{entry.example?.correct}</pre>
					</figure>
					<div class="site-meta">
						<span>{authorityLabels[entry.authority]}</span>
						{#each entry.sourceIds.flatMap((id) => {
							const source = getSource(id);
							return source ? [source] : [];
						}) as source (source.id)}
							<SiteSourceFold sources={[source]} />
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	h2 {
		margin: 0 0 var(--space-4);
		font-size: var(--font-size-lg);
	}
	ul {
		margin: 0;
		padding-inline-start: var(--space-5);
	}
	li + li {
		margin-top: var(--space-3);
	}
	.guide-questions--examples ul {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-6);
		list-style: none;
		padding: 0;
	}
	.guide-questions--examples li {
		margin: 0;
		min-width: 0;
	}
	.guide-questions--examples a {
		font-weight: var(--font-weight-semibold);
	}
	.guide-questions--examples .site-sample {
		margin-block: var(--space-3);
	}
	a:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}
</style>
