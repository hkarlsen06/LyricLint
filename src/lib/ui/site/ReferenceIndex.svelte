<script lang="ts">
	import { tick } from 'svelte';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
	import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
	import { afterNavigate } from '$app/navigation';
	import { base, resolve } from '$app/paths';
	import { assistantAvailable } from '$lib/assistant/api.js';
	import { useAssistantState, type AssistantState } from '$lib/assistant/assistant.svelte.js';
	import { referenceSearchTokens, type ReferenceDocument } from '$lib/reference/search.js';
	import { referenceTopics, referenceTopicAnchors } from '$lib/reference/topics.js';
	import { severityOrder, fixabilityOrder, fixabilityLabel } from '$lib/rules/reference-search.js';
	import { severityPluralLabels } from '$lib/diagnostics/severity-labels.js';
	import SearchHighlight from './SearchHighlight.svelte';
	import { stickyTopics } from './sticky-topics.js';
	import { readingAnchor } from './guidance-reading.svelte.js';
	import { safeDecodeHash } from './hash.js';
	import { followSelectedRow, revealSelectedRow, revealRow } from './reveal-selected.js';
	import {
		createReferenceResults,
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
	const reading = $derived(readingAnchor());
	const filters = $derived(referenceSearchState());
	const searching = $derived(filters.query.trim().length > 0);
	const tokens = $derived(referenceSearchTokens(filters.query));
	const scope = $derived(filters.scope);
	const hasFilters = $derived(
		searching ||
			scope !== 'all' ||
			!!filters.topic ||
			filters.severities.length > 0 ||
			filters.fixabilities.length > 0
	);
	let browsingTopics = $state(false);
	let filtersOpen = $state(false);
	const effectiveTopic = $derived(filters.topic);
	const directory = $derived(
		!searching &&
			!effectiveTopic &&
			!filters.browseAll &&
			(browsingTopics || (!selectedTopic && !selectedSlug && !reading)) &&
			!filters.severities.length &&
			!filters.fixabilities.length
	);
	const search = $derived(createReferenceResults(corpus));
	const matches = $derived(search());
	const results = $derived(
		searching
			? matches
			: [...matches].sort(
					(a, b) =>
						referenceTopics.findIndex((topic) => topic.id === a.topic) -
						referenceTopics.findIndex((topic) => topic.id === b.topic)
				)
	);

	const resultGroups = $derived(
		searching || effectiveTopic
			? [{ topic: '', title: '', results }]
			: referenceTopics.flatMap((topic) => {
					const group = results.filter((result) => result.topic === topic.id);
					return group.length ? [{ topic: topic.id, title: topic.title, results: group }] : [];
				})
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
	function readAnchor(): void {
		anchor = safeDecodeHash(location.hash.slice(1));
	}
	afterNavigate(() => {
		// Clearing filters only overrides the current article. A subsequent selection
		// must reveal its entries even though the shared finder stays mounted.
		browsingTopics = false;
		readAnchor();
	});
	$effect(() => {
		readAnchor();
		window.addEventListener('hashchange', readAnchor);
		return () => window.removeEventListener('hashchange', readAnchor);
	});
	let followedTopic: string | undefined;
	$effect(() => {
		if (!reading) return;
		const topic = corpus.find((doc) => doc.href.split('#')[1] === reading)?.topic;
		void followSelectedRow(column, !!followedTopic && topic !== followedTopic);
		followedTopic = topic;
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
		return !selectedSlug && doc.href.split('#')[1] === (reading || anchor) ? 'page' : undefined;
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

{#snippet topicLabel(topic: (typeof topics)[number])}
	<span class="reference-topic-copy">
		<span id={`topic-title-${topic.id}`}>{topic.title}</span>
		<span id={`topic-question-${topic.id}`} class="reference-topic-question">{topic.question}</span>
	</span>
	<ChevronRight size={16} aria-hidden="true" />
{/snippet}

<div
	class="site-split__index reference-index"
	data-sveltekit-noscroll
	bind:this={column}
	use:stickyTopics={[directory, resultGroups]}
	tabindex="-1"
>
	<div class="guide-glass" aria-hidden="true"></div>
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

		<div class="reference-tools">
			<button
				type="button"
				class="button button--quiet"
				aria-expanded={filtersOpen}
				aria-controls="reference-filters"
				onclick={() => (filtersOpen = !filtersOpen)}
			>
				<SlidersHorizontal aria-hidden="true" size={16} />
				Filters{scope !== 'all' ||
				filters.topic ||
				filters.severities.length ||
				filters.fixabilities.length
					? ' (active)'
					: ''}
			</button>
			{#if assistant && assistantAvailable()}
				<button
					type="button"
					class="button button--quiet reference-ask"
					onclick={() => void assistant.open()}
				>
					<WandSparkles aria-hidden="true" size={20} strokeWidth={1.75} />
					Ask a question
				</button>
			{/if}
		</div>
		{#if effectiveTopic || scope !== 'all'}
			<span class="reference-meta"
				>{selectedTitle ?? 'All topics'}{scope === 'rules'
					? ' · Linter checks'
					: scope === 'guidelines'
						? ' · Conventions'
						: ''}</span
			>
		{/if}
		<span class="sr-only" role="status"
			>{directory
				? ''
				: `${results.length} results${selectedTitle ? ` in ${selectedTitle}` : ''}`}</span
		>
	</search>

	<div id="reference-filters" class="reference-filters" hidden={!filtersOpen}>
		<div class="reference-filter-fields">
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
	</div>

	{#snippet resultHeading()}
		<div class="reference-results-header">
			<div>
				<h2>
					{directory
						? 'Browse by topic'
						: searching
							? 'Search results'
							: (selectedTitle ?? 'All topics')}
				</h2>
				{#if !directory}<p class="reference-count">
						{results.length}
						{results.length === 1 ? 'result' : 'results'}{searching ? ', best matches first' : ''}
					</p>{/if}
			</div>
			{#if directory}
				<button
					type="button"
					class="button button--quiet"
					onclick={() => setReferenceSearchState({ browseAll: true })}>Browse all</button
				>
			{:else}
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
					}}>{hasFilters ? 'Clear filters' : 'Browse topics'}</button
				>
			{/if}
		</div>
	{/snippet}

	{#if directory}
		<nav aria-label="Browse reference topics">
			{@render resultHeading()}
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
								aria-labelledby={`topic-title-${topic.id}`}
								aria-describedby={`topic-question-${topic.id}`}>{@render topicLabel(topic)}</a
							>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{:else}
							<button
								type="button"
								class="button button--quiet"
								onclick={() => setReferenceSearchState({ topic: topic.id, browseAll: false })}
								aria-labelledby={`topic-title-${topic.id}`}
								aria-describedby={`topic-question-${topic.id}`}>{@render topicLabel(topic)}</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		</nav>
	{:else}
		<nav aria-label="Reference results">
			{@render resultHeading()}
			{#each resultGroups as group (group.topic)}
				<div class:guide-topic={!!group.title}>
					{#if group.title}
						<div class="guide-topic-pin"><h3 class="guide-topic-title">{group.title}</h3></div>
						<div class="guide-topic-space" aria-hidden="true">
							<span>{group.title}</span><span class="guide-topic-compact">{group.title}</span>
						</div>
					{/if}
					<ul class="reference-results">
						{#each group.results as result (`${result.kind}:${result.id}`)}
							<li>
								<div class="reference-entry" data-current={current(result) || undefined}>
									<!-- Corpus hrefs are generated internal paths; base is applied before shared URL state. -->
									<!-- eslint-disable svelte/no-navigation-without-resolve -->
									<a
										class="reference-result"
										href={referenceHref(`${base}${result.href}`)}
										aria-current={current(result)}
										onclick={(event) => {
											if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
												// An explicit selection keeps the list under the pointer.
												followedTopic = result.topic;
											}
										}}
									>
										<span class="site-run__title"
											><SearchHighlight text={result.title} {tokens} /></span
										>
										<span class="reference-meta"
											>{result.kind === 'guideline' ? 'Convention' : 'Linter check'} · {result.topicTitle}{result.authority
												? ` · ${result.authority}`
												: ''}</span
										>
										{#if result.approximate}<span class="reference-meta">Similar wording</span>{/if}
									</a>
									<!-- eslint-enable svelte/no-navigation-without-resolve -->
									{#if result.relatedRules.length}
										<details
											class="reference-related"
											open={result.relatedRules.some((rule) =>
												current({ kind: 'rule', href: rule.href })
											)}
										>
											<summary>Related checks ({result.relatedRules.length})</summary>
											<ul>
												{#each result.relatedRules as rule (rule.id)}<!-- Corpus hrefs are generated internal paths with base explicitly applied. -->
													<!-- eslint-disable svelte/no-navigation-without-resolve -->
													<li>
														<a
															href={referenceHref(`${base}${rule.href}`)}
															aria-current={current({ kind: 'rule', href: rule.href })}
															>{rule.title}{#if current({ kind: 'rule', href: rule.href })}<span
																	class="reference-current-label"
																>
																	&nbsp;(current)</span
																>{/if}</a
														>
													</li>
													<!-- eslint-enable svelte/no-navigation-without-resolve -->{/each}
											</ul>
										</details>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
			{#if results.length === 0}<p class="site-index__empty">
					No results match. Try a shorter phrase, another topic, or clear the filters.
				</p>{/if}
		</nav>
	{/if}
</div>

<style>
	.reference-index {
		padding-block-end: max(var(--space-6), var(--split-navigation-clearance, 0px));
	}
	.reference-index h2 {
		margin-block: var(--space-4) var(--space-2);
		font-size: var(--font-size-lg);
	}
	.site-finder > label {
		font-weight: var(--font-weight-medium);
	}
	.site-finder {
		z-index: 3;
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
	.reference-tools,
	.reference-results-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.reference-tools .button {
		gap: var(--space-2);
	}
	.reference-tools [aria-expanded='true'] {
		background: var(--color-fill);
		text-decoration: underline;
		text-underline-offset: var(--space-1);
	}
	.reference-results-header {
		margin-block: var(--space-4) var(--space-3);
	}
	.reference-results-header h2,
	.reference-results-header p {
		margin: 0;
	}
	.reference-results-header > .button {
		flex-shrink: 0;
	}
	.reference-filter-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-3);
	}
	.reference-filter-fields .reference-controls {
		display: grid;
		gap: var(--space-1);
	}
	.reference-filters:not([hidden]) {
		padding-block: var(--space-3) var(--space-4);
		border-bottom: var(--border-width) solid var(--color-border);
	}
	.reference-filters > .reference-controls {
		margin-block-start: var(--space-3);
	}
	.reference-filter-fields label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}
	.reference-filter-fields select {
		width: 100%;
	}
	@media (max-width: 30rem) {
		.reference-filter-fields {
			grid-template-columns: minmax(0, 1fr);
		}
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
		padding-block: var(--space-2);
	}
	.reference-topics > li + li {
		border-top: var(--border-width) solid var(--color-border);
	}
	.reference-topic-question {
		display: block;
		margin-block-start: var(--space-1);
		font-weight: var(--font-weight-regular);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
	}
	.reference-topics a.button {
		text-decoration: none;
	}
	.reference-topics a.button:hover .reference-topic-copy > span:first-child {
		text-decoration: underline;
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
		min-height: var(--control-height-md);
		padding: var(--space-2) var(--space-2);
	}
	.reference-topics .button > span:first-child {
		font-weight: var(--font-weight-medium);
	}
	.reference-results > li + li {
		border-top: var(--border-width) solid var(--color-border);
	}
	.reference-result {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2);
		text-decoration: none;
		color: inherit;
		border-radius: var(--radius-control);
	}
	.reference-result:hover {
		background: var(--color-fill-subtle);
	}
	.reference-entry {
		margin-block: var(--space-2);
		border-inline-start: var(--current-row-marker-width) solid transparent;
		border-radius: var(--radius-control);
	}
	.reference-entry[data-current] {
		background: var(--color-fill-subtle);
		border-inline-start-color: var(--color-text);
	}
	.reference-entry .reference-result[aria-current='page'] {
		background: transparent;
		box-shadow: none;
	}

	.reference-meta,
	.reference-count {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.guide-topic {
		margin-block-start: var(--space-4);
	}
	.guide-topic-title {
		padding-inline: calc(var(--split-lane-start) + var(--space-2))
			calc(var(--split-lane-end) + var(--space-2));
	}
	.guide-topic-space > span {
		padding-inline: var(--space-2);
	}
	.reference-count {
		margin: 0 0 var(--space-2);
	}
	.reference-related {
		padding: 0 var(--space-2) var(--space-2);
		font-size: var(--font-size-sm);
	}
	.reference-related summary {
		cursor: pointer;
		color: var(--color-text-muted);
		width: fit-content;
	}
	.reference-related ul {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
	}
	.reference-related a {
		display: block;
		padding: var(--space-1) var(--space-2);
		overflow-wrap: anywhere;
		border-radius: var(--radius-control);
	}
	.reference-related a:hover {
		background: var(--color-fill);
	}
	.reference-current-label {
		font-weight: var(--font-weight-medium);
		color: var(--color-text);
	}
	.reference-related a[aria-current='page'] {
		text-decoration-thickness: var(--focus-ring-width);
		font-weight: var(--font-weight-semibold);
	}
</style>
