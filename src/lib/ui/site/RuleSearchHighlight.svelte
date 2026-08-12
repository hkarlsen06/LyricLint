<script lang="ts">
	import { ruleSearchTokens } from './rule-search.svelte.js';
	import SearchHighlight from './SearchHighlight.svelte';

	/**
	 * A string with the rule reference's live query marked in it — the shared
	 * `SearchHighlight` bound to this section's own tokens, so the dozen call
	 * sites on a rule page never name the token source themselves. Everything
	 * about the marking, its whitespace discipline included, is the base's; the
	 * template here is a single component tag, which Svelte trims cleanly.
	 */
	let { text }: { text: string } = $props();
</script>

<SearchHighlight {text} tokens={ruleSearchTokens()} />
