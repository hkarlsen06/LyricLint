<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- Topic links only append a trailing slash to a resolved route. */
	import ListMusic from 'lucide-svelte/icons/list-music';
	import AudioLines from 'lucide-svelte/icons/audio-lines';
	import Ear from 'lucide-svelte/icons/ear';
	import Hash from 'lucide-svelte/icons/hash';
	import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
	import { resolve } from '$app/paths';
	import { siteUrl } from '$lib/seo.js';
	import type { PageProps } from './$types.js';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Musixmatch transcription guide · LyricLint</title>
	<meta
		name="description"
		content="Musixmatch transcription requirements, language exceptions, source conflicts, and the exact scope of deterministic checks."
	/>
	<link rel="canonical" href={siteUrl('/guidelines/musixmatch/')} />
</svelte:head>

<main id="main" tabindex="-1" class="site-prose site-split__page musixmatch-welcome">
	<h1>Musixmatch transcription guide</h1>
	<p class="site-lede">
		Read the transcription requirements, language exceptions and what each check can establish.
	</p>
	<p class="site-meta">
		{data.claimCount} researched clauses · {data.conflictCount} unresolved source scopes
	</p>
	<h2>Start with the bit you are stuck on</h2>
	<ul class="reference-questions">
		<li>
			<a href={`${resolve('/(site)/guidelines/musixmatch/[topic]', { topic: 'section-headers' })}/`}
				><ListMusic size={24} aria-hidden="true" /><span>How do I tag song sections?</span></a
			>
		</li>
		<li>
			<a href={`${resolve('/(site)/guidelines/musixmatch/[topic]', { topic: 'ad-libs' })}/#mx-f05`}
				><AudioLines size={24} aria-hidden="true" /><span>How do I write backing vocals?</span></a
			>
		</li>
		<li>
			<a
				href={`${resolve('/(site)/guidelines/musixmatch/[topic]', { topic: 'censored-unknown' })}/#mx-t04`}
				><Ear size={24} aria-hidden="true" /><span>What if a word is censored in the audio?</span
				></a
			>
		</li>
		<li>
			<a href={`${resolve('/(site)/guidelines/musixmatch/[topic]', { topic: 'numbers' })}/#mx-f06`}
				><Hash size={24} aria-hidden="true" /><span>Should I use digits or words?</span></a
			>
		</li>
	</ul>
	<h2>Browse by topic</h2>
	<ul class="musixmatch-topics">
		{#each data.topics as topic (topic.id)}
			<li>
				<a href={`${resolve('/(site)/guidelines/musixmatch/[topic]', { topic: topic.id })}/`}>
					<span>{topic.title}</span>
					<span class="musixmatch-count">{topic.count}</span>
				</a>
			</li>
		{/each}
	</ul>
	<h2>What switching preserves</h2>
	<p>
		Switching profiles changes the document's presentation. Source wording, section labels and
		performer information remain part of the saved document. Listening, meaning, uncertain lyrics
		and translation require your review; a switch cannot establish them.
	</p>
	<h2>Where the sources disagree</h2>
	<p>
		Japanese instrumental spacing and parenthetical capitalization, French times and Norwegian joik
		classification have unresolved scope. LyricLint preserves authored text and identifies the
		relevant sources rather than choosing a policy from its publication date.
	</p>
	<h2>Language-specific evidence</h2>
	<p>
		English, Norwegian, Arabic, German, Spanish, French, Japanese and Korean keep separate language
		scope. Dedicated Arabic and Korean policy evidence remains incomplete; general checks do not
		establish complete language coverage. No English spelling or numeric fallback substitutes for
		that evidence.
	</p>
	<div class="guide-practice">
		<p>Already have some lyrics written down?</p>
		<a class="button button--contrast" href={resolve('/workbench/')}
			>Check your lyrics <ArrowUpRight size={16} aria-hidden="true" /></a
		>
	</div>
</main>

<style>
	.musixmatch-welcome h2 {
		margin-top: var(--space-7);
		font-size: var(--font-size-lg);
	}
	.reference-questions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		list-style: none;
		padding: 0;
		gap: var(--space-3);
		margin-block: var(--space-4) var(--space-6);
	}
	.reference-questions li {
		margin: 0;
		min-width: 0;
	}
	.reference-questions a {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4) var(--space-2);
		height: 100%;
		padding: var(--space-4);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
		line-height: var(--line-height-body);
	}
	.reference-questions a:hover {
		background: var(--color-fill-subtle);
		border-color: var(--color-border-strong);
	}
	.reference-questions a > :global(svg:first-child) {
		grid-column: 1 / -1;
		color: var(--color-text-muted);
	}
	.musixmatch-topics {
		list-style: none;
		padding: 0;
		margin: var(--space-4) 0 var(--space-6);
		display: grid;
		gap: var(--space-2);
	}
	.musixmatch-topics a {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-panel);
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	.musixmatch-topics a:hover {
		background: var(--color-fill-subtle);
		border-color: var(--color-border-strong);
	}
	.musixmatch-count {
		flex: none;
		padding-inline: var(--space-2);
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-round);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}
	.guide-practice {
		margin-block: var(--space-6) var(--space-7);
	}
	.guide-practice p {
		margin-bottom: var(--space-3);
		color: var(--color-text-muted);
	}
	@media (max-width: 25rem) {
		.reference-questions {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
