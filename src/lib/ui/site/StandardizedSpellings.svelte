<script lang="ts">
	import { resolve } from '$app/paths';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
	import { authorityLabels, guidanceTopicLandmarks } from '#lib/guidance/guidance.js';
	import { getSource } from '#lib/rules/data/sources.js';
	import type { RuleLookupTable } from '#lib/rules/lookup-tables.js';
	import SiteSourceFold from './SiteSourceFold.svelte';
	import { referenceHref } from './reference-search.svelte.js';

	let { spellings }: { spellings: RuleLookupTable } = $props();
	const previewForms = ["I'ma", 'okay', 'tryna', 'ayy', 'though', 'skrrt'];
	const entries = $derived(
		previewForms.flatMap((form) =>
			spellings.entries.filter((entry) => entry.preferred.includes(form))
		)
	);
	const landmark = guidanceTopicLandmarks.spelling?.find(
		(entry) => entry.id === 'standardized-spellings'
	);
</script>

<section class="standardized-spellings" aria-label="Standardized spellings">
	<h2>Standardized spellings</h2>
	<table aria-label="Standardized spelling examples">
		<thead>
			<tr><th scope="col">Use</th><th scope="col">Instead of</th></tr>
		</thead>
		<tbody>
			{#each entries as entry (entry.preferred.join(','))}
				<tr>
					<td><code>{entry.preferred.join(', ')}</code></td>
					<td><code>{entry.instead.join(', ')}</code></td>
				</tr>
			{/each}
		</tbody>
	</table>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- Keeps search on the resolved spelling topic and its lookup fragment. -->
	<a
		href={referenceHref(
			`${resolve('/(site)/guidelines/[topic]', { topic: 'spelling' })}/#standardized-spellings`
		)}>See all standardized spellings</a
	>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{#if landmark}
		<details class="site-disclosure site-disclosure--compact">
			<summary
				><span class="site-disclosure__label">Source</span><CaretDownIcon
					class="site-disclosure__chevron"
					size={12}
					weight="bold"
					aria-hidden="true"
				/></summary
			>
			<div class="spelling-source">
				<span>{authorityLabels[landmark.authority]}</span>
				{#each landmark.sourceIds.flatMap((id) => {
					const source = getSource(id);
					return source ? [source] : [];
				}) as source (source.id)}
					<SiteSourceFold sources={[source]} />
				{/each}
			</div>
		</details>
	{/if}
</section>

<style>
	.standardized-spellings {
		margin-bottom: var(--space-7);
	}
	h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--font-size-lg);
	}
	table {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
		margin: 0 0 var(--space-4);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
	}
	th,
	td {
		padding: var(--space-1) 0;
		text-align: start;
		vertical-align: top;
		overflow-wrap: anywhere;
	}
	th {
		font-weight: var(--font-weight-medium);
		color: var(--color-text-muted);
	}
	th:first-child,
	td:first-child {
		width: 35%;
		padding-inline-end: var(--space-4);
	}
	td:first-child {
		font-weight: var(--font-weight-semibold);
	}
	code {
		font-family: var(--font-mono);
		font-size: inherit;
	}
	a {
		font-weight: var(--font-weight-medium);
	}
	a:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}
	details {
		margin-top: var(--space-3);
		font-size: var(--font-size-sm);
	}
	.spelling-source {
		display: grid;
		gap: var(--space-2);
	}
</style>
