<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		countGuidanceLookups,
		filterGuidanceSections,
		type GuidanceTopicSection
	} from '$lib/guidance/guidance-search.js';
	import { entryAnchor, guidanceTopicTitles } from '$lib/guidance/guidance.js';
	import AssistantPrompt from '$lib/ui/assistant/AssistantPrompt.svelte';
	import { revealSelectedRow } from './reveal-selected.js';

	let {
		sections,
		selectedTopic
	}: {
		sections: readonly GuidanceTopicSection[];
		selectedTopic?: string | undefined;
	} = $props();

	// The list and its search outlive opening a guideline, because the section's
	// layout mounts this component once: a reader who searched, pressed a row,
	// and came back finds the search they were in the middle of. Component state
	// rather than the rule reference's module state, because nothing in the
	// detail column marks what was searched for here — the day a topic page
	// highlights hits, this moves to a module the way `rule-search.svelte.ts` did.
	let query = $state('');
	const total = $derived(countGuidanceLookups(sections));
	const filtered = $derived(filterGuidanceSections(sections, query));
	const shown = $derived(countGuidanceLookups(filtered));
	const narrowing = $derived(query.trim().length > 0);

	// A guideline is a fragment on its topic's page, so "which row is current"
	// has two halves: the topic is the route's own param, and the entry is the
	// hash — which the router does not model. `afterNavigate` covers arrivals
	// that change the path; `hashchange` covers the one it never fires for, a
	// navigation that changes only the fragment (the topic-page reveal has the
	// same pair, measured there rather than assumed). Empty until hydration,
	// which is honest: the server cannot see a fragment.
	let anchor = $state('');

	function readAnchor(): void {
		anchor = decodeURIComponent(location.hash.slice(1));
	}

	afterNavigate(readAnchor);

	$effect(() => {
		readAnchor();
		window.addEventListener('hashchange', readAnchor);
		return () => window.removeEventListener('hashchange', readAnchor);
	});

	function entryCurrent(topic: string, entryId: string): 'page' | undefined {
		return selectedTopic === topic && anchor === entryAnchor(entryId) ? 'page' : undefined;
	}

	let column = $state<HTMLElement>();

	export async function revealSelected(): Promise<void> {
		await revealSelectedRow(column);
	}

	// Escape empties the field, which is the one convention a search input owes
	// and the only way out this surface needs: nothing here is pending. It stops
	// there rather than moving focus — the reader is still typing.
	function onFieldKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || query === '') return;
		event.preventDefault();
		query = '';
	}
</script>

<div class="site-split__index" data-sveltekit-noscroll bind:this={column}>
	<!-- The way to ask a model about the guidelines, above the way to search
	     them — the same prompt the rule index carries, and only in builds that
	     actually have an assistant endpoint behind it. -->
	<AssistantPrompt />

	<!-- The rule reference's own finder, minus its chips: severity and
	     fixability are facts about linter rules, and most of this list is
	     guidance the linter cannot check. -->
	<search class="site-finder">
		<label class="sr-only" for="guidelines-search">Search the transcription guidelines</label>
		<input
			id="guidelines-search"
			class="site-finder__search"
			type="search"
			autocomplete="off"
			spellcheck="false"
			placeholder={`Search ${total} lookups`}
			bind:value={query}
			onkeydown={onFieldKeydown}
		/>

		{#if narrowing}
			<p class="site-finder__readout">
				<span role="status">{shown} of {total} lookups</span>
				<button
					type="button"
					class="button button--quiet site-finder__clear"
					onclick={() => (query = '')}
				>
					Clear search
				</button>
			</p>
		{/if}
	</search>

	<nav aria-label="Transcription guidelines">
		{#each filtered as { topic, entries, linterRules } (topic)}
			<h2 class="site-index__group">{guidanceTopicTitles[topic]}</h2>
			<!-- One bordered run per topic, hairlines between rows — the same
			     material as the rule index's runs. A guidance row opens its entry on
			     the topic page, anchored and washed; a linter row is a lookup out to
			     the rule reference, with the rule id in the source face saying whose
			     row it is. Only guidance rows are ever `aria-current`: a linter row's
			     page is never this section's. -->
			<ul class="site-run">
				{#each entries as entry (entry.id)}
					<li>
						<a
							href="{resolve('/(site)/guidelines/[topic]', { topic })}/#{entryAnchor(entry.id)}"
							aria-current={entryCurrent(topic, entry.id)}
						>
							<span class="site-run__title">{entry.title}</span>
							<span class="site-run__message">{entry.statement}</span>
						</a>
					</li>
				{/each}
				{#each linterRules as rule (rule.id)}
					<li>
						<a href="{resolve('/(site)/rules/[rule]', { rule: rule.slug })}/">
							<span class="site-run__title">{rule.title}</span>
							<span class="site-run__message">{rule.message}</span>
							<span class="site-run__meta">
								<span class="site-code">{rule.id}</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/each}

		<!-- Prose on the canvas, not a box: a single centred card in an empty
		     column separates its contents from nothing. The way out is the
		     readout's own `Clear search` directly above. -->
		{#if shown === 0}
			<p class="site-index__empty">No lookup matches this search. Try fewer or shorter words.</p>
		{/if}
	</nav>
</div>
