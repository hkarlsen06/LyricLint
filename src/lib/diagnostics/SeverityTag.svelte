<script lang="ts">
	import type { Severity } from '$lib/core/types.js';
	import SeverityIcon from './SeverityIcon.svelte';

	let {
		severity,
		/**
		 * Whether the word is on screen beside the glyph. The rule reference says
		 * it: there the severity is a fact in a document, read once, by a reader who
		 * may never have opened the workbench. A diagnostic's meta line does not:
		 * eight rows down the panel the word is the same word eight times, and the
		 * glyph and its color were already carrying it. Unlabelled it stays in the
		 * accessible tree, and the tooltip hands it to the pointer.
		 */
		labelled = true
	}: { severity: Severity; labelled?: boolean } = $props();

	const label = $derived(
		severity === 'manual-review'
			? 'Manual review'
			: `${severity.slice(0, 1).toUpperCase()}${severity.slice(1)}`
	);
</script>

<!-- The same tag on both surfaces: what marks a diagnostic in the panel is what
     marks it in the editor's popover, so the two read as one thing seen twice. -->
<span class={`severity severity--${severity}`} title={labelled ? undefined : label}>
	<SeverityIcon {severity} />
	{#if labelled}
		{label}
	{:else}
		<span class="sr-only">{label}</span>
	{/if}
</span>

<style>
	/*
	 * Not a badge. A mark. The severity used to be a filled tag on a line of its
	 * own, which cost the card a full line of height to say one word that the
	 * metadata line was already the place for. No fill, no border, no radius, so
	 * nothing about it reads as pressable next to the severity filters that
	 * genuinely are.
	 *
	 * On the rule reference it is the glyph and the colored word. On a diagnostic's
	 * meta line it is the glyph alone, leading the line: `⚠ Line 47 · Repeated
	 * sections`. A word that is the same word down every row of a nine-item panel
	 * has stopped being read by the second one: what the eye was using there is
	 * the shape and the color, and both survive dropping it.
	 *
	 * The color is the whole signal, so it is the text color rather than a wash
	 * behind muted text: `--color-danger` and its siblings are text-grade against
	 * both `--color-surface` and the recessed `--color-canvas` an expanded card
	 * drops to. It is never the *only* signal: the four glyphs are drawn to
	 * separate at 12px in greyscale, which is what `SeverityIcon.svelte` is for.
	 */
	.severity {
		display: inline-flex;
		width: fit-content;
		gap: var(--space-1);
		align-items: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.01em;
	}

	.severity--error {
		color: var(--color-danger);
	}

	.severity--warning {
		color: var(--color-warning);
	}

	.severity--suggestion {
		color: var(--color-suggestion);
	}

	.severity--manual-review {
		color: var(--color-manual);
	}
</style>
