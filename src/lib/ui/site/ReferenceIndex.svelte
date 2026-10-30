<script lang="ts">
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import MagicWandIcon from 'phosphor-svelte/lib/MagicWandIcon';
	import SlidersHorizontalIcon from 'phosphor-svelte/lib/SlidersHorizontalIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import { assistantAvailable } from '#lib/assistant/api.js';
	import { useAssistantState, type AssistantState } from '#lib/assistant/assistant.svelte.js';
	import { referenceSearchTokens, type ReferenceDocument } from '#lib/reference/search.js';
	import { referenceTopics, referenceTopicAnchors } from '#lib/reference/topics.js';
	import { severityOrder, fixabilityOrder, fixabilityLabel } from '#lib/rules/reference-search.js';
	import { severityPluralLabels } from '#lib/diagnostics/severity-labels.js';
	import SearchHighlight from './SearchHighlight.svelte';
	import CodeProse from './CodeProse.svelte';
	import GuideQuestions from './GuideQuestions.svelte';
	import { safeDecodeHash } from './hash.js';
	import {
		createReferenceResults,
		referenceSearchState,
		setReferenceSearchState,
		referenceHref,
		resetReferenceSearchState
	} from './reference-search.svelte.js';

	let {
		corpus,
		selectedSlug,
		selectedTopic,
		assistant: assistantProp
	}: {
		corpus: readonly ReferenceDocument[];
		selectedSlug?: string;
		selectedTopic?: string;
		assistant?: AssistantState;
	} = $props();
	const root = resolve('/(site)');
	const contextAssistant = useAssistantState();
	const assistant = $derived(assistantProp ?? contextAssistant);
	const filters = $derived(referenceSearchState());
	const tokens = $derived(referenceSearchTokens(filters.query));
	const searching = $derived(!!filters.query.trim());
	const narrowed = $derived(
		filters.scope !== 'all' ||
			!!filters.topic ||
			!!filters.severities.length ||
			!!filters.fixabilities.length
	);
	const showResults = $derived(searching || narrowed || filters.browseAll);
	const search = $derived(createReferenceResults(corpus));
	const results = $derived(search());
	const topics = $derived(
		referenceTopics.filter((topic) => corpus.some((doc) => doc.topic === topic.id))
	);
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
	let filtersOpen = $state(false);
	let anchor = $state('');
	let path = $state('');
	function readLocation(): void {
		anchor = safeDecodeHash(location.hash.slice(1));
		path = location.pathname;
	}
	afterNavigate(readLocation);
	$effect(() => {
		readLocation();
		window.addEventListener('hashchange', readLocation);
		return () => window.removeEventListener('hashchange', readLocation);
	});
	function current(doc: ReferenceDocument): 'page' | undefined {
		if (doc.kind === 'rule')
			return selectedSlug && doc.href.endsWith(`/checks/${selectedSlug}/`) ? 'page' : undefined;
		return selectedTopic === doc.topic && doc.href.split('#')[1] === anchor ? 'page' : undefined;
	}
	function scope(value: string): void {
		if (value === 'all' || value === 'guidelines' || value === 'rules')
			setReferenceSearchState({ scope: value, severities: [], fixabilities: [] });
	}
	function query(value: string): void {
		setReferenceSearchState({ query: value });
	}
</script>

{#snippet marked(text: string)}<SearchHighlight {text} {tokens} />{/snippet}

<div class="reference-index" tabindex="-1">
	<search aria-label="Find transcription answers">
		<label for="reference-search">What are you working on?</label>
		<input
			class="site-finder__search"
			id="reference-search"
			disabled={!ready}
			type="search"
			autocomplete="off"
			spellcheck="false"
			placeholder="Try two singers, an unclear word…"
			value={filters.query}
			oninput={(event) => query(event.currentTarget.value)}
			onkeydown={(event) => {
				if (event.key === 'Escape' && filters.query) {
					event.preventDefault();
					query('');
				}
			}}
		/>
		<div class="reference-tools">
			<button
				type="button"
				class="button button--quiet"
				aria-expanded={filtersOpen}
				aria-controls="reference-filters"
				disabled={!ready}
				onclick={() => (filtersOpen = !filtersOpen)}
				><SlidersHorizontalIcon size={16} aria-hidden="true" />Filters{narrowed
					? ' (active)'
					: ''}</button
			>
			{#if assistant && assistantAvailable()}
				<button
					type="button"
					class="button button--quiet reference-ask"
					disabled={!ready}
					onclick={() => void assistant.open()}
					><MagicWandIcon size={18} aria-hidden="true" />Ask a question</button
				>
			{/if}
		</div>
		<p class="sr-only" role="status">{showResults ? `${results.length} results` : ''}</p>
	</search>
	<div id="reference-filters" class="reference-filters" hidden={!filtersOpen}>
		<label for="reference-content">Show</label>
		<select
			id="reference-content"
			value={filters.scope}
			onchange={(event) => scope(event.currentTarget.value)}
		>
			<option value="all">All advice and checks</option><option value="guidelines"
				>Transcription advice</option
			><option value="rules">LyricLint checks</option>
		</select>
		<label for="reference-topic">Topic</label>
		<select
			id="reference-topic"
			value={filters.topic}
			onchange={(event) => setReferenceSearchState({ topic: event.currentTarget.value })}
		>
			<option value="">All topics</option>{#each topics as topic (topic.id)}<option value={topic.id}
					>{topic.title}</option
				>{/each}
		</select>
		{#if filters.scope === 'rules'}
			<fieldset>
				<legend>Severity</legend>
				<div class="reference-options">
					{#each severityOrder.filter( (value) => corpus.some((doc) => doc.severity === value) ) as severity (severity)}
						<button
							type="button"
							class="button"
							aria-pressed={filters.severities.includes(severity)}
							onclick={() =>
								setReferenceSearchState({
									severities: filters.severities.includes(severity)
										? filters.severities.filter((value) => value !== severity)
										: [...filters.severities, severity]
								})}>{severityPluralLabels[severity]}</button
						>
					{/each}
				</div>
			</fieldset>
			<fieldset>
				<legend>Fix type</legend>
				<div class="reference-options">
					{#each fixabilityOrder.filter( (value) => corpus.some((doc) => doc.fixability === value) ) as fixability (fixability)}
						<button
							type="button"
							class="button"
							aria-pressed={filters.fixabilities.includes(fixability)}
							onclick={() =>
								setReferenceSearchState({
									fixabilities: filters.fixabilities.includes(fixability)
										? filters.fixabilities.filter((value) => value !== fixability)
										: [...filters.fixabilities, fixability]
								})}>{fixabilityLabel(fixability)}</button
						>
					{/each}
				</div>
			</fieldset>
		{/if}
	</div>

	{#if showResults}
		<section aria-labelledby="reference-results-title" class="reference-matches">
			<div class="reference-results-header">
				<h2 id="reference-results-title">{searching ? 'Search results' : 'Matching advice'}</h2>
				<button class="button button--quiet" type="button" onclick={resetReferenceSearchState}
					>{searching && !narrowed && !filters.browseAll ? 'Clear search' : 'Clear filters'}</button
				>
			</div>
			<p class="reference-count">
				{results.length}
				{results.length === 1 ? 'result' : 'results'}{searching ? ', best matches first' : ''}
			</p>
			{#if !results.length}<p>
					No answers match yet. Try a shorter phrase or clear the filters. You can also browse the
					topics below.
				</p>{/if}
			<ul class="reference-results">
				{#each results as result (`${result.kind}:${result.id}`)}
					<li class="reference-result" class:reference-result--current={!!current(result)}>
						<!-- eslint-disable svelte/no-navigation-without-resolve -- Server-derived local corpus URL with the configured base and retained search. -->
						<a
							href={referenceHref(`${root}${result.href.slice(1)}`)}
							aria-current={current(result)}
						>
							<span class="reference-result-title"
								><SearchHighlight text={result.title} {tokens} /></span
							>
							<span class="reference-result-context"
								>{result.topicTitle}{result.kind === 'rule'
									? ' · LyricLint check'
									: ''}{result.approximate ? ' · Similar spelling' : ''}</span
							>
							<span class="reference-description"
								><CodeProse text={result.snippet || result.summary} mark={marked} /></span
							>
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{#if result.relatedRules.length}
							<details class="reference-related">
								<summary>Related checks ({result.relatedRules.length})</summary>
								<ul>
									{#each result.relatedRules as check (check.id)}<li>
											<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Same server-derived route contract as the result above. -->
											<a href={referenceHref(`${root}${check.href.slice(1)}`)}>{check.title}</a>
										</li>{/each}
								</ul>
							</details>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<nav aria-label="Browse reference topics" class="reference-directory">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- All reference links preserve search on resolved local routes. -->
		<div class="reference-start">
			<a
				href={referenceHref(resolve('/(site)/guidelines/essentials'))}
				aria-label="Start with the essentials"
				aria-current={path.includes('/guidelines/essentials') ? 'page' : undefined}
				><span
					>Start with the essentials<span class="reference-topic-question"
						>Practical starting points for new transcribers</span
					></span
				>
				<CaretRightIcon size={16} aria-hidden="true" /></a
			>
		</div>
		{#if !showResults && !selectedTopic && !selectedSlug && !path.includes('/guidelines/all') && !path.includes('/guidelines/essentials')}
			<div class="reference-questions"><GuideQuestions /></div>
		{/if}
		<h2>Browse by topic</h2>
		<ul class="reference-topics">
			{#each topics as topic (topic.id)}
				<li
					id={topic.id}
					data-fragment-current={referenceTopicAnchors(topic.id).includes(anchor) || undefined}
				>
					{#each referenceTopicAnchors(topic.id).filter((id) => id !== topic.id) as legacyAnchor (legacyAnchor)}<span
							id={legacyAnchor}
							aria-hidden="true"
						></span>{/each}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Keep a reader's query available when returning from a topic. -->
					<a
						href={referenceHref(`${resolve('/(site)/guidelines/[topic]', { topic: topic.id })}/`)}
						aria-current={selectedTopic === topic.id ? 'page' : undefined}
					>
						<span
							><span class="reference-topic-title">{topic.title}</span><span
								class="reference-topic-question">{topic.question}</span
							></span
						><CaretRightIcon size={16} aria-hidden="true" />
					</a>
				</li>
			{/each}
		</ul>
		<a
			class="reference-read-all"
			href={referenceHref(resolve('/(site)/guidelines/all'))}
			aria-current={path.includes('/guidelines/all') ? 'page' : undefined}>Read the whole guide</a
		>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</nav>
</div>

<style>
	.reference-index {
		min-width: 0;
	}
	label,
	legend {
		display: block;
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-semibold);
		margin-bottom: var(--space-2);
	}
	input,
	select {
		width: 100%;
		font: inherit;
		font-size: var(--font-size-editor);
		min-height: var(--control-height-lg);
	}
	.reference-tools {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: var(--space-2);
	}
	.reference-filters {
		padding-block: var(--space-4);
	}
	.reference-filters select {
		margin-bottom: var(--space-4);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: var(--space-3) 0;
		min-width: 0;
	}
	.reference-options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.reference-options [aria-pressed='true'] {
		outline: var(--focus-ring-width) solid var(--color-text);
		outline-offset: calc(-1 * var(--focus-ring-width));
		font-weight: var(--font-weight-bold);
	}
	h2 {
		font-size: var(--font-size-lg);
		margin: 0;
	}
	.reference-results-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.reference-count,
	.reference-result-context {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}
	.reference-matches {
		margin-top: var(--space-5);
	}
	.reference-results,
	.reference-topics {
		list-style: none;
		padding: 0;
		margin: var(--space-3) 0 0;
	}
	.reference-result {
		border-bottom: var(--border-width) solid var(--color-border);
		border-inline-start: var(--focus-ring-width) solid transparent;
		padding-inline-start: var(--space-3);
		padding-block: var(--space-4);
	}
	.reference-result:first-child {
		padding-top: 0;
	}
	.reference-result > a {
		display: grid;
		gap: var(--space-2);
		color: var(--color-text);
		text-decoration: none;
	}
	.reference-result-title {
		font-weight: var(--font-weight-semibold);
	}
	.reference-description {
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
	}
	.reference-result--current {
		border-inline-start-color: var(--color-text);
		background: var(--color-fill-subtle);
	}
	.reference-result details {
		margin-top: var(--space-2);
		font-size: var(--font-size-sm);
	}
	summary {
		cursor: pointer;
	}
	.reference-directory {
		margin-top: var(--space-6);
	}
	.reference-questions {
		display: none;
		margin-bottom: var(--space-6);
	}
	.reference-start {
		margin-bottom: var(--space-6);
	}
	.reference-start a {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		font-weight: var(--font-weight-semibold);
	}
	.reference-topics a {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
		color: var(--color-text);
		text-decoration: none;
		border-inline-start: var(--focus-ring-width) solid transparent;
		border-radius: var(--radius-control);
	}
	.reference-topics a[aria-current='page'] {
		border-inline-start-color: var(--color-text);
		background: var(--color-fill-subtle);
		font-weight: var(--font-weight-semibold);
	}
	.reference-topics a:hover,
	.reference-result > a:hover {
		background: var(--color-fill-subtle);
	}
	.reference-topic-title,
	.reference-topic-question {
		display: block;
	}
	.reference-topic-title {
		font-size: var(--font-size-sm);
	}
	.reference-topic-question {
		margin-top: var(--space-1);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-regular);
		line-height: var(--line-height-body);
	}
	.reference-read-all {
		display: inline-block;
		margin-top: var(--space-5);
	}
	a:focus-visible,
	summary:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}
	@media (max-width: 62rem) {
		.reference-questions {
			display: block;
		}
		.reference-topic-title {
			font-size: var(--font-size-md);
		}
		.reference-topic-question {
			font-size: var(--font-size-sm);
		}
	}
</style>
