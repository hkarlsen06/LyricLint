<script lang="ts">
	// One citation is the meta line's last word; two or more wrap the line into
	// a second and a third row — the exact mess the diagnostic card's meta rule
	// exists to prevent — so they fold behind the card's own `Sources ⌄`
	// disclosure instead, and unfolded each citation reads exactly as the
	// inline one does, tooltip and search marking included. The control reuses
	// the card's classes rather than restating them, so there is one
	// implementation of what this disclosure looks like; only the unfolded
	// list's place in the site's own meta row is site CSS.
	import { ChevronDown } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import type { SourceReference } from '$lib/core/types.js';
	import SourceCitation from '$lib/diagnostics/SourceCitation.svelte';

	let {
		sources,
		text
	}: {
		sources: readonly SourceReference[];
		/** Optional search-marking snippet, passed through to each citation. */
		text?: Snippet<[string]>;
	} = $props();

	const folded = $derived(sources.length > 1);
	let expanded = $state(false);
</script>

{#if folded}
	<button
		type="button"
		class="button button--quiet diagnostic-meta__disclosure"
		aria-expanded={expanded}
		onclick={() => {
			expanded = !expanded;
		}}
	>
		<!-- The label names what is behind it and stays put; the chevron and
		     `aria-expanded` are what carry the open state, so the control does
		     not rewrite itself under the pointer that just pressed it. -->
		Sources
		<ChevronDown class="diagnostic-meta__chevron" aria-hidden="true" size={11} strokeWidth={2.4} />
	</button>
	{#if expanded}
		<!-- A plain list, no box and no rules around it, exactly as the card
		     unfolds its own. -->
		<ul class="diagnostic-meta__sources site-meta__sources" aria-label="Sources">
			{#each sources as source (source.id)}
				<li><SourceCitation {source} {text} /></li>
			{/each}
		</ul>
	{/if}
{:else if sources[0]}
	<SourceCitation source={sources[0]} {text} />
{/if}
