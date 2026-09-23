<script lang="ts">
	import type { Snippet } from 'svelte';
	import { codeSegments } from './code-segments.js';

	/**
	 * A sentence whose quoted forms are set in the page's code face.
	 *
	 * Both reference sections write prose that names literal text: a lookup
	 * condition (`` `cuz` remains valid when it means cousin ``), a rule
	 * family's guidance, a guidance entry's statement (`` an apostrophe on the
	 * side of the omission, `ballin'`, `gon'` for `gonna` ``). The reason
	 * is the same every time: unmarked, the form is a word of the sentence, and
	 * the reader has to work out that `and` is being quoted rather than used.
	 * The face is what says a run of characters is the thing itself.
	 *
	 * The splitting was already shared (`code-segments.ts`); the *drawing* of it
	 * was not, and three call sites had hand-written the same nested `{#each}`
	 * with the same span, which is the drift `copySectionLinks` exists as one
	 * function for, arriving in markup.
	 *
	 * A `<code>`, not a span: what it holds is a fragment of computer-readable
	 * text quoted inside a sentence, which is exactly the element's own meaning,
	 * and the styling (`.site-form` below) is a fill rather than the
	 * face alone, because a mono `and` at the sentence's own size is still a
	 * conjunction.
	 *
	 * `mark` is the section's own search-marking snippet where the surface has
	 * one, so a form the reader searched for is still marked inside the face
	 * rather than losing its highlight to the box around it, and a form is the
	 * word most likely to have been searched for. A surface with no query
	 * passes none.
	 *
	 * Like `SearchHighlight`, it draws text and nothing else, no wrapper, so it
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

<style>
	/*
	 * A form a sentence *names* rather than uses, set apart from the prose it is
	 * quoted inside: `gon'` for `gonna`, the word `lyrics`, `'90s`.
	 *
	 * The face alone is not enough here, and that is what separates this from
	 * `.site-code` in `site.css`. That one labels something the reader already knows is an
	 * identifier: it stands alone in a row, or is the whole of a link. This one is
	 * a run of characters in the middle of a sentence, competing with the words
	 * either side of it. Read at the same size in the same colour, a mono
	 * `and` is a conjunction, and a step down in size alone reads as small text
	 * rather than as quoted text. The fill is what says where the form starts and
	 * stops, which is the same argument `.site-sample` makes at block size: this is
	 * a different material from the prose around it.
	 *
	 * A fill and a radius and no border. A hairline around a 13px run in the middle
	 * of a line is a rectangle competing with the sentence for the reader's eye,
	 * and the fill has already done the separating. The border would be the
	 * decoration `A card has to earn its border` is about, at inline scale.
	 *
	 * Inline padding is safe where block padding on a box would not be: padding on
	 * an inline element does not grow its line box, so a paragraph full of these
	 * keeps its rhythm and nothing below it moves.
	 *
	 * And a form does not break across lines. `jet ski` split at its space, which
	 * left half a box at the end of one line and half at the start of the next:
	 * two forms where the sentence names one. The longest form the catalog carries
	 * is twenty characters, so `nowrap` costs the narrowest screen nothing; a form
	 * long enough to need a line of its own belongs in `example`, which is the
	 * sample face and the block-sized answer to the same question.
	 *
	 * The size is relative and floored, because this is drawn in two registers. In
	 * a statement it sits in body copy, where a fixed `--font-size-xs` is a fifth
	 * smaller than its neighbours, the drop that read as small rather than as
	 * quoted. In a lookup note it sits in `--font-size-xs` text already, where
	 * 0.9em would take it below the smallest type on the site. `max()` is one
	 * declaration answering both: a step down from whatever it is inside, never
	 * under the ramp's own floor.
	 */
	.site-form {
		padding: var(--space-0-5) var(--space-1);
		border-radius: var(--radius-xs);
		background: var(--color-fill-subtle);
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: max(0.9em, var(--font-size-xs));
	}
</style>
