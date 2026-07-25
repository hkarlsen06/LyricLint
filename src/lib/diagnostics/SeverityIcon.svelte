<script lang="ts">
	import type { Severity } from '$lib/core/types.js';

	let { severity }: { severity: Severity } = $props();
</script>

<!--
	The mark for a severity, wherever a severity is marked: the diagnostic's meta
	line, and the filter chip that hides or shows it. Sharing it is what ties a
	chip to the rows it governs now that the row no longer spells the word out.

	The four shapes have to separate at 12px *without* their color, because on the
	meta line the glyph is the whole of the severity. Error used to be `!` in a
	circle and suggestion `i` in one — the same ring with the bar and the dot
	swapped, which is a coin flip at this size — so error is a cross now and the
	interiors read as four different marks: ✕, !, i, ✓.
-->
<svg
	class="severity-icon"
	aria-hidden="true"
	viewBox="0 0 16 16"
	width="12"
	height="12"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
>
	{#if severity === 'error'}
		<circle cx="8" cy="8" r="6" />
		<path d="m5.9 5.9 4.2 4.2M10.1 5.9l-4.2 4.2" />
	{:else if severity === 'warning'}
		<path d="M8 2.4 14.4 13H1.6Z" />
		<path d="M8 6.6v2.9M8 11.6v.1" />
	{:else if severity === 'suggestion'}
		<circle cx="8" cy="8" r="6" />
		<path d="M8 7.4v3.4M8 4.9v.1" />
	{:else}
		<circle cx="8" cy="8" r="6" />
		<path d="M5.4 8.2 7.2 10l3.4-3.6" />
	{/if}
</svg>
