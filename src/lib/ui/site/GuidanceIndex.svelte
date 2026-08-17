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
	import { readingAnchor } from './guidance-reading.svelte.js';
	import { guidanceSearchQuery, setGuidanceSearchQuery } from './guidance-search.svelte.js';
	import { safeDecodeHash } from './hash.js';
	import { followSelectedRow, revealSelectedRow } from './reveal-selected.js';

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
		// Decoded through the shared helper, because a fragment is somebody else's
		// string: `#%` throws a `URIError`, and a throw in here takes the column
		// down on the arrival the deep link was made for.
		anchor = safeDecodeHash(location.hash.slice(1));
	}

	afterNavigate(readAnchor);

	$effect(() => {
		readAnchor();
		window.addEventListener('hashchange', readAnchor);
		return () => window.removeEventListener('hashchange', readAnchor);
	});

	/**
	 * Which entry the open topic page says the reader is on, published as they
	 * scroll (`guidance-reading.svelte.ts`). It outranks the hash, and that is
	 * the whole of what makes this list follow the page beside it: the hash is
	 * where the reader was *sent*, which stops being true the moment they scroll
	 * off that entry, and is empty altogether for a topic opened without a
	 * fragment. The hash is the fallback for the two states the page cannot
	 * answer in — before it has hydrated, and at the section's index view, where
	 * there is no page.
	 */
	const reading = $derived(readingAnchor());

	function entryCurrent(topic: string, entryId: string): 'page' | undefined {
		if (selectedTopic !== topic) return undefined;
		return (reading || anchor) === entryAnchor(entryId) ? 'page' : undefined;
	}

	let column = $state<HTMLElement>();

	export async function revealSelected(): Promise<void> {
		await revealSelectedRow(column);
	}

	/**
	 * And the list travels with it. The mark alone answers "where am I" only for
	 * the rows on screen, and a topic runs to more of them than the column holds
	 * — so the reading position scrolling out of the list is the same list
	 * silently stopping.
	 *
	 * `followSelectedRow` is the nudge rather than the reveal: it moves only when
	 * the row has actually left, and only as far as the nearer edge. Pressing a
	 * row therefore still moves nothing, which is the rule this column has
	 * everywhere else — the row a reader pressed is by definition one they can
	 * see, so the follow finds it comfortable and returns.
	 */
	$effect(() => {
		if (!reading) return;
		void followSelectedRow(column);
	});

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
	     fixability are facts about linter rules, and this list is the
	     conventions rather than the checks. The struck-through sparkles at the
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
		{#each filtered as { topic, landmarks, entries } (topic)}
			<h2 class="site-index__group">{guidanceTopicTitles[topic]}</h2>
			<!-- One bordered run per topic, hairlines between rows — the same
			     material as the rule index's runs. A row opens its entry on the
			     topic page, anchored and washed, and states the convention where it
			     stands; the way out to the rule reference is each entry's own
			     "Checked by" line. The index used to close every topic with a run of
			     linter-rule rows; they retired when every rule became reachable
			     through an entry, with their search terms folded into the entries'
			     haystacks (`ruleTerms` on the section). -->
			<ul class="site-run">
				{#each landmarks ?? [] as landmark (landmark.id)}
					<li>
						<a
							href="{resolve('/(site)/guidelines/[topic]', { topic })}/#{landmark.id}"
							aria-current={entryCurrent(topic, landmark.id)}
						>
							<span class="site-run__title">{landmark.title}</span>
							<span class="site-run__message">{landmark.statement}</span>
						</a>
					</li>
				{/each}
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
