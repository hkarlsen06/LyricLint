<script lang="ts">
	import type { Snippet } from 'svelte';
	import { codeSegments } from './code-segments.js';

	/**
	 * A sentence whose quoted forms are set in the page's code face.
	 *
	 * Both reference sections write prose that names literal text — a lookup
	 * condition (`` `cuz` remains valid when it means cousin ``), a rule
	 * family's guidance, a guidance entry's statement (`` an apostrophe on the
	 * side of the omission — `ballin'`, `gon'` for `gonna` ``) — and the reason
	 * is the same every time: unmarked, the form is a word of the sentence, and
	 * the reader has to work out that `and` is being quoted rather than used.
	 * The face is what says a run of characters is the thing itself.
	 *
	 * The splitting was already shared (`code-segments.ts`); the *drawing* of it
	 * was not, and three call sites had hand-written the same nested `{#each}`
	 * with the same span — which is the drift `copySectionLinks` exists as one
	 * function for, arriving in markup.
	 *
	 * A `<code>`, not a span: what it holds is a fragment of computer-readable
	 * text quoted inside a sentence, which is exactly the element's own meaning,
	 * and the styling (`.site-form` in `site.css`) is a fill rather than the
	 * face alone — a mono `and` at the sentence's own size is still a
	 * conjunction.
	 *
	 * `mark` is the section's own search-marking snippet where the surface has
	 * one, so a form the reader searched for is still marked inside the face
	 * rather than losing its highlight to the box around it — and a form is the
	 * word most likely to have been searched for. A surface with no query
	 * passes none.
	 *
	 * Like `SearchHighlight`, it draws text and nothing else — no wrapper — so it
	 * stands inside a `<p>`, a muted meta line or a heading without any of them
	 * knowing it is there. Which is why the template below is one unbroken line
	 * and this comment is in the script: Svelte does not trim a template opening
	 * with a comment node, and every space around it would come out as a real
	 * text node in front of the sentence.
	 */
	let { text, mark }: { text: string; mark?: Snippet<[string]> } = $props();

	const segments = $derived(codeSegments(text));
</script>

{#each segments as segment, index (index)}{#if segment.code}<code class="site-form"
			>{#if mark}{@render mark(segment.text)}{:else}{segment.text}{/if}</code
		>{:else if mark}{@render mark(segment.text)}{:else}{segment.text}{/if}{/each}
