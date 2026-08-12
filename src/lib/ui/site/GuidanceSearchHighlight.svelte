<script lang="ts">
	import { guidanceSearchTokens } from './guidance-search.svelte.js';
	import SearchHighlight from './SearchHighlight.svelte';

	/**
	 * A string with the guidance catalog's live query marked in it —
	 * `RuleSearchHighlight`'s twin, bound to this section's own tokens. The
	 * topic pages draw every string a search can match through this, so a
	 * guideline opened out of a search says which of its words matched, exactly
	 * as a rule page does: the two sections look identical, and a behavior
	 * learned in one has to hold in the other.
	 */
	let { text }: { text: string } = $props();
</script>

<SearchHighlight {text} tokens={guidanceSearchTokens()} />
