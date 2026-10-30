<script lang="ts">
	import { resolve } from '$app/paths';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import EarIcon from 'phosphor-svelte/lib/EarIcon';
	import PlaylistIcon from 'phosphor-svelte/lib/PlaylistIcon';
	import UsersIcon from 'phosphor-svelte/lib/UsersIcon';
	import WaveformIcon from 'phosphor-svelte/lib/WaveformIcon';
	import { guidanceEntries } from '#lib/guidance/entries.js';
	import { entryAnchor } from '#lib/guidance/guidance.js';
	import { referenceHref } from './reference-search.svelte.js';

	// Mounted twice on the directory (desktop reader, phone finder), so ids are per instance.
	const uid = $props.id();
	const questions = [
		{
			label: 'How do I label song sections?',
			id: 'guidance.section-headers.bracketed-headers',
			Icon: PlaylistIcon
		},
		{
			label: 'How do I credit different singers?',
			id: 'guidance.section-headers.artist-identifiers',
			Icon: UsersIcon
		},
		{
			label: 'What if I cannot hear a word?',
			id: 'guidance.censored-unknown.unknown-marker',
			Icon: EarIcon
		},
		{ label: 'How do I write ad-libs?', id: 'guidance.ad-libs.include-every', Icon: WaveformIcon }
	].flatMap((question) =>
		guidanceEntries
			.filter((entry) => entry.id === question.id)
			.map((entry) => ({ ...question, entry }))
	);
</script>

<section class="guide-questions" aria-labelledby="{uid}-heading">
	<h2 id="{uid}-heading">Common questions</h2>
	<ul>
		{#each questions as { label, entry, Icon }, index (entry.id)}
			<li>
				<span class="guide-questions__icon"
					><Icon size={20} weight="bold" aria-hidden="true" /></span
				>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- Keeps search on a resolved canonical entry link. -->
				<a
					href={referenceHref(
						`${resolve('/(site)/guidelines/[topic]', { topic: entry.topic })}/#${entryAnchor(entry.id)}`
					)}
					aria-describedby={entry.example ? `${uid}-example-${index}` : undefined}>{label}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{#if entry.example}
					<p class="guide-questions__example" id="{uid}-example-{index}">
						<span class="sr-only">Example:</span>
						<code>{entry.example.correct}</code>
					</p>
				{/if}
				<span class="guide-questions__caret"><CaretRightIcon size={16} aria-hidden="true" /></span>
			</li>
		{/each}
	</ul>
</section>

<style>
	.guide-questions {
		container-type: inline-size;
	}
	h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--font-size-lg);
	}
	ul {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* Each tile is one independent destination: the border marks that region, and the
	   link stretches over it so the whole tile answers a press. The raised surface and the
	   muted subject icon are the old welcome column's question cards, kept beside the
	   example and caret the destination tile added. */
	.guide-questions li {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-content: start;
		column-gap: var(--space-3);
		row-gap: var(--space-1);
		margin: 0;
		padding: var(--space-4);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		background: var(--color-surface);
		transition:
			background-color var(--duration-fast) var(--ease-out-quart),
			border-color var(--duration-fast) var(--ease-out-quart);
	}
	.guide-questions li:hover {
		border-color: var(--color-border-strong);
		background: var(--color-fill-subtle);
	}
	.guide-questions__icon {
		display: flex;
		grid-row: 1 / span 2;
		grid-column: 1;
		align-self: start;
		color: var(--color-text-muted);
	}
	a {
		grid-column: 2;
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
		text-decoration: none;
	}
	a::after {
		content: '';
		position: absolute;
		inset: calc(-1 * var(--border-width));
		border-radius: var(--radius-panel);
	}
	a:focus-visible {
		outline: none;
	}
	a:focus-visible::after {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}
	li:hover a {
		text-decoration: underline;
	}
	.guide-questions__example {
		grid-column: 2;
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
		overflow-wrap: anywhere;
	}
	code {
		font-family: var(--font-mono);
		font-size: inherit;
	}
	.guide-questions__caret {
		display: flex;
		grid-row: 1 / span 2;
		grid-column: 3;
		align-self: center;
		color: var(--color-text-muted);
		transition: transform var(--duration-fast) var(--ease-out-quart);
	}
	li:hover .guide-questions__icon {
		color: var(--color-text);
	}
	li:hover .guide-questions__caret {
		color: var(--color-text);
		transform: translateX(var(--space-0-5));
	}
	@container (max-width: 30rem) {
		ul {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.guide-questions li,
		.guide-questions__caret {
			transition: none;
		}
		li:hover .guide-questions__caret {
			transform: none;
		}
	}
</style>
