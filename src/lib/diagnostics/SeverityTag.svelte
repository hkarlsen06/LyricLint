<script lang="ts">
	import type { Severity } from '$lib/core/types.js';
	import SeverityIcon from './SeverityIcon.svelte';

	let {
		severity,
		/**
		 * Whether the word is on screen beside the glyph. The rule reference says
		 * it: there the severity is a fact in a document, read once, by a reader who
		 * may never have opened the workbench. A diagnostic's meta line does not —
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
