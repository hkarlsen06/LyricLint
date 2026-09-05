<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronRight } from 'lucide-svelte';
	import { afterNavigate } from '$app/navigation';
	import { base, resolve } from '$app/paths';
	import { assistantAvailable } from '$lib/assistant/api.js';
	import { useAssistantState, type AssistantState } from '$lib/assistant/assistant.svelte.js';
	import {
		searchReference,
		referenceSearchTokens,
		type ReferenceDocument
	} from '$lib/reference/search.js';
	import { referenceTopics, referenceTopicAnchors } from '$lib/reference/topics.js';
	import { severityOrder, fixabilityOrder, fixabilityLabel } from '$lib/rules/reference-search.js';
	import { severityPluralLabels } from '$lib/diagnostics/severity-labels.js';
	import SearchHighlight from './SearchHighlight.svelte';
	import { readingAnchor } from './guidance-reading.svelte.js';
	import { safeDecodeHash } from './hash.js';
	import { followSelectedRow, revealSelectedRow, revealRow } from './reveal-selected.js';
	import {
		referenceSearchState,
		setReferenceSearchState,
		referenceHref
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

	const contextAssistant = useAssistantState();
	const assistant = $derived(assistantProp ?? contextAssistant);
	const filters = $derived(referenceSearchState());
	const searching = $derived(filters.query.trim().length > 0);
	const tokens = $derived(referenceSearchTokens(filters.query));
	const scope = $derived(filters.scope);
	let browsingTopics = $state(false);
	const implicitTopic = $derived(
		!browsingTopics && !searching && !filters.browseAll
			? corpus.find((doc) =>
					selectedSlug
						? doc.href === `/guidelines/checks/${selectedSlug}/`
						: doc.kind === 'guideline' && doc.href.startsWith(`/guidelines/${selectedTopic}/`)
				)?.topic
			: undefined
	);
	const effectiveTopic = $derived(filters.topic || implicitTopic);
	const directory = $derived(
		!searching &&
			!effectiveTopic &&
			!filters.browseAll &&
			!filters.severities.length &&
			!filters.fixabilities.length
	);
	const matches = $derived(
		searchReference(corpus, filters.query, {
			scope,
			topic: effectiveTopic,
			severities: scope === 'rules' && filters.severities.length ? filters.severities : undefined,
			fixabilities:
				scope === 'rules' && filters.fixabilities.length ? filters.fixabilities : undefined
		})
	);
	const results = $derived(
		searching
			? matches
			: [...matches].sort(
					(a, b) =>
						referenceTopics.findIndex((topic) => topic.id === a.topic) -
						referenceTopics.findIndex((topic) => topic.id === b.topic)
				)
	);

	const topics = $derived(
		referenceTopics.filter((topic) =>
			corpus.some(
				(doc) =>
					doc.topic === topic.id &&
					(scope === 'all' || doc.kind === (scope === 'rules' ? 'rule' : 'guideline'))
			)
		)
	);
	const selectedTitle = $derived(
		referenceTopics.find((topic) => topic.id === effectiveTopic)?.title
	);
	let column = $state<HTMLElement>();
	let anchor = $state('');
	const reading = $derived(readingAnchor());
	function readAnchor(): void {
		anchor = safeDecodeHash(location.hash.slice(1));
	}
	afterNavigate(() => {
		// Browse topics only overrides the current article. A subsequent selection
		// must reveal its entries even though the shared finder stays mounted.
		browsingTopics = false;
		readAnchor();
	});
	$effect(() => {
		readAnchor();
		window.addEventListener('hashchange', readAnchor);
		return () => window.removeEventListener('hashchange', readAnchor);
	});
	$effect(() => {
		if (reading) void followSelectedRow(column);
	});
	$effect(() => {
		if (!directory || !anchor || selectedSlug || selectedTopic) return;
		const target = topics.find((topic) => referenceTopicAnchors(topic.id).includes(anchor));
		if (!target) return;
		void tick().then(() =>
			revealRow(column, column?.querySelector<HTMLElement>(`li[id="${target.id}"]`))
		);
	});

	function current(doc: Pick<ReferenceDocument, 'kind' | 'href'>): 'page' | undefined {
		const path = doc.href.split('#')[0];
		if (doc.kind === 'rule')
			return selectedSlug && path === `/guidelines/checks/${selectedSlug}/` ? 'page' : undefined;
		return selectedTopic &&
			path === `/guidelines/${selectedTopic}/` &&
			doc.href.split('#')[1] === (reading || anchor)
			? 'page'
			: undefined;
	}

	/** Reveal the current result without discarding the reader's search or filters. */
	export async function revealSelected(): Promise<void> {
		await revealSelectedRow(column);
	}
	function setQuery(query: string): void {
		setReferenceSearchState({ query });
	}
	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && filters.query) {
			event.preventDefault();
			setQuery('');
		}
	}
</script>

<div class="site-split__index reference-index" data-sveltekit-noscroll bind:this={column}>
	<search class="site-finder" aria-label="Find transcription answers">
		<label for="reference-search">Search the transcription guide</label>
		<input
			id="reference-search"
			class="site-finder__search"
			type="search"
			autocomplete="off"
			spellcheck="false"
			placeholder="Try two singers, a spelling, or a warning"
			value={filters.query}
			oninput={(event) => setQuery(event.currentTarget.value)}
			onkeydown={onKeydown}
		/>
		<details class="reference-filters">
			<summary
				>Filters{scope !== 'all' ||
				filters.topic ||
				filters.severities.length ||
				filters.fixabilities.length
					? ' (active)'
					: ''}</summary
			>
			<div class="reference-controls">
				<label for="reference-content">Content</label>
				<select
					id="reference-content"
					value={scope}
					onchange={(event) =>
						setReferenceSearchState({
							scope: event.currentTarget.value as 'all' | 'guidelines' | 'rules',
							severities: [],
							fixabilities: []
						})}
				>
					<option value="all">Everything</option><option value="guidelines">Conventions</option
					><option value="rules">Linter checks</option>
				</select>
			</div>
			<div class="reference-controls">
				<label for="reference-topic">Topic</label>
				<select
					id="reference-topic"
					value={effectiveTopic ?? ''}
					onchange={(event) =>
						setReferenceSearchState({
							topic: event.currentTarget.value,
							browseAll: event.currentTarget.value === ''
						})}
				>
					<option value="">All topics</option>
					{#each referenceTopics as topic (topic.id)}<option value={topic.id}>{topic.title}</option
						>{/each}
				</select>
			</div>
			{#if scope === 'rules'}
				<div class="reference-controls" role="group" aria-label="Filter checks by severity">
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
				<div class="reference-controls" role="group" aria-label="Filter checks by fix type">
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
				<p class="reference-meta">
					Choose categories to narrow the checks. No selection includes every category.
				</p>
			{/if}
		</details>
		{#if !directory || scope !== 'all'}
			<div class="reference-controls">
				{#if effectiveTopic || scope !== 'all'}<span class="reference-meta"
						>{selectedTitle ?? 'All topics'}{scope === 'rules'
							? ' · Linter checks'
							: scope === 'guidelines'
								? ' · Conventions'
								: ''}</span
					>{/if}
				<button
					type="button"
					class="button button--quiet"
					onclick={() => {
						browsingTopics = true;
						setReferenceSearchState({
							query: '',
							scope: 'all',
							topic: '',
							browseAll: false,
							severities: [],
							fixabilities: []
						});
					}}>Browse topics</button
				>

				{#if scope !== 'all' || filters.topic || filters.severities.length || filters.fixabilities.length}<button
						type="button"
						class="button button--quiet"
						onclick={() => {
							browsingTopics = true;
							setReferenceSearchState({
								scope: 'all',
								topic: '',
								severities: [],
								fixabilities: []
							});
						}}>Clear filters</button
					>{/if}
				{#if searching}<button
						type="button"
						class="button button--quiet"
						onclick={() => setQuery('')}>Clear search</button
					>{/if}
			</div>
		{/if}
		{#if assistant && assistantAvailable()}
			<button
				type="button"
				class="button button--quiet button--flush reference-ask"
				onclick={() => void assistant.open()}>Ask a question</button
			>
		{/if}
		<span class="sr-only" role="status"
			>{directory
				? ''
				: `${results.length} results${selectedTitle ? ` in ${selectedTitle}` : ''}`}</span
		>
	</search>

	{#if directory}
		<nav aria-label="Browse reference topics">
			<h2>Browse by topic</h2>
			<ul class="reference-topics">
				{#each topics as topic (topic.id)}
					<li
						id={topic.id}
						data-fragment-current={referenceTopicAnchors(topic.id).includes(anchor) || undefined}
					>
						{#each referenceTopicAnchors(topic.id).filter((id) => id !== topic.id) as legacyAnchor (legacyAnchor)}<span
								id={legacyAnchor}
								class="reference-legacy-anchor"
								aria-hidden="true"
							></span>{/each}
						{#if scope === 'all'}
							<!-- The shared search wrapper receives a route already resolved for the base path. -->
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								class="button button--quiet"
								href={referenceHref(
									`${resolve('/(site)/guidelines/[topic]', { topic: topic.id })}/`
								)}
								aria-describedby={`topic-question-${topic.id}`}
								><span>{topic.title}</span><ChevronRight size={16} aria-hidden="true" /></a
							>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{:else}
							<button
								type="button"
								class="button button--quiet"
								onclick={() => setReferenceSearchState({ topic: topic.id, browseAll: false })}
								aria-describedby={`topic-question-${topic.id}`}
								><span>{topic.title}</span><ChevronRight size={16} aria-hidden="true" /></button
							>
						{/if}
						<span id={`topic-question-${topic.id}`} class="sr-only">{topic.question}</span>
					</li>
				{/each}
			</ul>
			<button
				type="button"
				class="button"
				onclick={() => setReferenceSearchState({ browseAll: true })}>Browse all</button
			>
		</nav>
	{:else}
		<nav aria-label="Reference results">
			<h2>{searching ? 'Search results' : (selectedTitle ?? 'All topics')}</h2>
			<p class="reference-count">
				{results.length}
				{results.length === 1 ? 'result' : 'results'}{searching ? ', best matches first' : ''}
			</p>
			<ul class="reference-results">
				{#each results as result, index (`${result.kind}:${result.id}`)}
					<li>
						{#if !searching && !effectiveTopic && results[index - 1]?.topic !== result.topic}<h3>
								{result.topicTitle}
							</h3>{/if}
						<!-- Corpus hrefs are generated internal paths; base is applied before shared URL state. -->
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							class="reference-result"
							href={referenceHref(`${base}${result.href}`)}
							aria-current={current(result)}
						>
							<span class="site-run__title"><SearchHighlight text={result.title} {tokens} /></span>
							<span class="reference-meta"
								>{result.kind === 'guideline' ? 'Convention' : 'Linter check'} · {result.topicTitle}{result.authority
									? ` · ${result.authority}`
									: ''}</span
							>
							<span class="reference-description"
								><SearchHighlight text={result.snippet} {tokens} /></span
							>
							{#if result.approximate}<span class="reference-meta">Similar wording</span>{/if}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{#if result.relatedRules.length}
							<div class="reference-related">
								<span>Related checks:</span
								>{#each result.relatedRules as rule (rule.id)}<!-- Corpus hrefs are generated internal paths with base explicitly applied. -->
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										href={referenceHref(`${base}${rule.href}`)}
										aria-current={current({ kind: 'rule', href: rule.href })}
										>{rule.title}{#if current({ kind: 'rule', href: rule.href })}<span
												class="reference-current-label"
											>
												&nbsp;(current)</span
											>{/if}</a
									><!-- eslint-enable svelte/no-navigation-without-resolve -->{/each}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			{#if results.length === 0}<p class="site-index__empty">
					No results match. Try a shorter phrase, another topic, or clear the filters.
				</p>{/if}
		</nav>
	{/if}
</div>

<style>
	.reference-index h2 {
		margin-block: var(--space-4) var(--space-2);
		font-size: var(--font-size-lg);
	}
	.site-finder > label {
		font-weight: var(--font-weight-medium);
	}
	.site-finder__search,
	select {
		font-size: var(--font-size-editor);
	}
	.reference-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.reference-controls select {
		min-width: 0;
		max-width: 100%;
	}
	.reference-controls [aria-pressed='true'] {
		background: var(--color-fill);
		border-color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}
	.reference-filters .reference-controls {
		margin-block: var(--space-2);
	}
	.reference-filters summary {
		cursor: pointer;
	}
	.reference-ask {
		justify-self: start;
	}
	.reference-topics {
		display: block;
	}
	.reference-topics,
	.reference-results {
		list-style: none;
		padding: 0;
		margin: 0 0 var(--space-4);
	}
	.reference-topics > li {
		position: relative;
	}
	.reference-legacy-anchor {
		position: absolute;
		width: 0;
		height: 0;
		inset-block-start: 0;
		inset-inline-start: 0;
	}
	.reference-topics > li[data-fragment-current] {
		box-shadow: inset var(--space-0-5) 0 var(--color-text);
		background: var(--color-fill);
		border-radius: var(--radius-control);
	}
	.reference-topics .button {
		display: grid;
		width: 100%;
		height: auto;
		text-align: start;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2);
		min-height: calc(var(--control-height-lg) + var(--space-2));
		padding: var(--space-2) var(--space-2);
	}
	.reference-topics .button > span:first-child {
		font-weight: var(--font-weight-medium);
	}
	.reference-description {
		color: var(--color-text-muted);
		font-size: var(--font-size-md);
		line-height: var(--line-height-body);
	}
	.reference-results > li + li {
		border-top: var(--border-width) solid var(--color-border);
	}
	.reference-result {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-4) var(--space-2);
		text-decoration: none;
		color: inherit;
		border-radius: var(--radius-control);
	}
	.reference-result:hover {
		background: var(--color-fill-subtle);
	}
	.reference-result[aria-current='page'] {
		background: var(--color-fill);
		box-shadow: inset var(--space-0-5) 0 var(--color-text);
	}
	.reference-meta,
	.reference-count {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.reference-results h3 {
		margin: var(--space-4) var(--space-2) 0;
		font-size: var(--font-size-lg);
	}
	.reference-count {
		margin: 0 0 var(--space-2);
	}
	.reference-related {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		padding: 0 var(--space-2) var(--space-4);
		font-size: var(--font-size-sm);
	}
	.reference-current-label {
		font-weight: var(--font-weight-medium);
		color: var(--color-text);
	}
	.reference-related a[aria-current='page'] {
		text-decoration-thickness: var(--focus-ring-width);
		font-weight: var(--font-weight-semibold);
	}
	.reference-related > span {
		color: var(--color-text-muted);
	}
</style>
