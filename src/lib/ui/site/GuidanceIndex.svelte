<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		countGuidanceLookups,
		filterGuidanceSections,
		type GuidanceTopicSection
	} from '$lib/guidance/guidance-search.js';
	import { entryAnchor, guidanceTopicTitles } from '$lib/guidance/guidance.js';
	import AssistantSpark from '$lib/ui/assistant/AssistantSpark.svelte';
	import { guidanceSearchQuery, setGuidanceSearchQuery } from './guidance-search.svelte.js';
	import LinterRuleRow from './LinterRuleRow.svelte';
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
	// and came back finds the search they were in the middle of. The query is
	// module state (`guidance-search.svelte.ts`) for the reason the rule
	// reference's is: the topic page marks what was searched for, and the page
	// and this list are siblings under the layout with nothing to hand each
	// other. The field binds to the pair of functions rather than to a local
	// mirror, or the two copies disagree for as long as an effect takes to run.
	const query = $derived(guidanceSearchQuery());
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
		setGuidanceSearchQuery('');
	}
</script>

<div class="site-split__index" data-sveltekit-noscroll bind:this={column}>
	<!-- The rule reference's own finder, minus its chips: severity and
	     fixability are facts about linter rules, and most of this list is
	     guidance the linter cannot check. The struck-through sparkles at the
	     field's end is the assistant's toggle; the spark owns the row, and this
	     component only supplies its own search field. -->
	<search class="site-finder">
		<label class="sr-only" for="guidelines-search">Search the transcription guidelines</label>
		<AssistantSpark prompt="Ask about the transcription guidelines">
			{#snippet search()}
				<input
					id="guidelines-search"
					class="site-finder__search"
					type="search"
					autocomplete="off"
					spellcheck="false"
					placeholder={`Search ${total} conventions`}
					bind:value={guidanceSearchQuery, setGuidanceSearchQuery}
					onkeydown={onFieldKeydown}
				/>
			{/snippet}
		</AssistantSpark>

		{#if narrowing}
			<p class="site-finder__readout">
				<span role="status">{shown} of {total} conventions</span>
				<button
					type="button"
					class="button button--quiet site-finder__clear"
					onclick={() => setGuidanceSearchQuery('')}
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
			     the topic page, anchored and washed, and states the convention where
			     it stands; a linter row is one line pointing out to the rule
			     reference, where the same rule is read whole (`LinterRuleRow`). Only
			     guidance rows are ever `aria-current`: a linter row's page is never
			     this section's. -->
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
					<LinterRuleRow {rule} />
				{/each}
			</ul>
		{/each}

		<!-- Prose on the canvas, not a box: a single centred card in an empty
		     column separates its contents from nothing. The way out is the
		     readout's own `Clear search` directly above. -->
		{#if shown === 0}
			<p class="site-index__empty">
				No convention matches this search. Try fewer or shorter words.
			</p>
		{/if}
	</nav>
</div>
