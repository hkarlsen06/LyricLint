<script lang="ts">
	import { highlightSegments } from '$lib/rules/reference-search.js';

	/**
	 * A string with a live query marked in it. The base both reference sections
	 * share: `RuleSearchHighlight` hands it the rule reference's tokens and
	 * `GuidanceSearchHighlight` the guidance catalog's, so the marking itself —
	 * the arithmetic, the element, the whitespace discipline — cannot drift
	 * between the two sections that look identical.
	 *
	 * A page is opened out of a search far more often than it is browsed to, and
	 * what it opens onto is a wall of prose and samples. The reader has just been
	 * told this page matched `cousin`, and then has to find the word themselves.
	 * This is that answer drawn where it was earned, and it is the same argument
	 * the workbench makes by previewing a fix as a diff: show it rather than
	 * making the reader ask.
	 *
	 * It draws text and nothing else — no wrapper element — so it can stand
	 * inside a heading, a `<pre>`, a muted `<span>` or a run of code segments
	 * without any of them having to know it is there.
	 *
	 * Which is why the template below is one unbroken line, and why this comment
	 * is in the script rather than standing over it as markup. Svelte does not
	 * trim a template that opens with a comment node, so everything around that
	 * comment — the newline under the script block, the blank line, the comment's
	 * own indentation — came out as a real text node in front of the text. In a
	 * `<pre>` that is three lines of a transcription nobody typed, at the top of
	 * every reviewed example on the site. `RuleSearchHighlight.svelte.test.ts`
	 * measures the rendered text against the string it was handed rather than
	 * trusting any of this, because it is a formatter that will break it and it
	 * looks exactly like working markup when it does.
	 *
	 * `<mark>` rather than a styled span: the semantics are exactly the
	 * element's — text marked for reference to something outside the document it
	 * sits in — which also puts the fact in the accessible tree, where colour on
	 * its own cannot go.
	 */
	let { text, tokens }: { text: string; tokens: readonly string[] } = $props();

	const segments = $derived(highlightSegments(text, tokens));
</script>

{#each segments as segment, index (index)}{#if segment.match}<mark class="site-hit"
			>{segment.text}</mark
		>{:else}{segment.text}{/if}{/each}
