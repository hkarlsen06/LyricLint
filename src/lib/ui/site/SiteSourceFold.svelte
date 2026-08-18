<script lang="ts">
	// One citation is the meta line's last word; two or more wrap the line into
	// a second and a third row — the exact mess the diagnostic card's meta rule
	// exists to prevent — so they fold behind the card's own `Sources ⌄`
	// disclosure instead, and unfolded each citation reads exactly as the
	// inline one does, tooltip and search marking included. The control reuses
	// the card's classes rather than restating them, so there is one
	// implementation of what this disclosure looks like; only the unfolded
	// list's place in the site's own meta row is site CSS.
	//
	// A run of citations is not the only run that wraps this line. An entry's
	// `Checked by` ids are the other one — nine of them are seven lines of
	// monospace links pushing the statement off the screen — and a second
	// disclosure written beside this one would be a second implementation of
	// the same control, which is the drift this component exists to prevent.
	// So the content is a slot: `children` is any run that folds the same way,
	// `folded` is the caller's own answer to whether it is long enough to be
	// worth folding, `label` is what the button names, and `prefix` is the
	// words that introduce the run and stay outside the button. All four are
	// optional, so a citation caller passes none of them and is unchanged.
	import { ChevronDown } from 'lucide-svelte';
	import type { Snippet } from 'svelte';
	import type { SourceReference } from '$lib/core/types.js';
	import SourceCitation from '$lib/diagnostics/SourceCitation.svelte';

	let {
		sources = [],
		text,
		label = 'Sources',
		folded,
		prefix,
		children
	}: {
		sources?: readonly SourceReference[];
		/** Optional search-marking snippet, passed through to each citation. */
		text?: Snippet<[string]>;
		/** What the disclosure names — the citations' own word by default. */
		label?: string;
		/** Whether the run is long enough to fold; more than one citation by default. */
		folded?: boolean;
		/** Words introducing the run, which stay outside the button either way. */
		prefix?: string;
		/** A run that is not citations, drawn the same folded or inline. */
		children?: Snippet;
	} = $props();

	const foldsAway = $derived(folded ?? sources.length > 1);
	let expanded = $state(false);
</script>

{#if foldsAway}
	{#if prefix}<span>{prefix}</span>{/if}
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
		{label}
		<ChevronDown class="diagnostic-meta__chevron" aria-hidden="true" size={11} strokeWidth={2.4} />
	</button>
	{#if expanded}
		{#if children}
			<!-- The same run the inline branch draws, in a row of its own under the
			     whole meta line — the citations' own place, and for the same
			     reason: a run spliced into the middle of the line is what folding
			     it was for. -->
			<span class="site-meta__sources">{@render children()}</span>
		{:else}
			<!-- A plain list, no box and no rules around it, exactly as the card
			     unfolds its own. -->
			<ul class="diagnostic-meta__sources site-meta__sources" aria-label={label}>
				{#each sources as source (source.id)}
					<li><SourceCitation {source} {text} /></li>
				{/each}
			</ul>
		{/if}
	{/if}
{:else if children}
	{#if prefix}<span>{prefix} {@render children()}</span>{:else}{@render children()}{/if}
{:else if sources[0]}
	<SourceCitation source={sources[0]} {text} />
{/if}
