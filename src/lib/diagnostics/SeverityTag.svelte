<script lang="ts">
	import type { Severity } from '$lib/core/types.js';

	let { severity }: { severity: Severity } = $props();

	const label = $derived(
		severity === 'manual-review'
			? 'Manual review'
			: `${severity.slice(0, 1).toUpperCase()}${severity.slice(1)}`
	);
</script>

<!-- The same tag on both surfaces: what marks a diagnostic in the panel is what
     marks it in the editor's popover, so the two read as one thing seen twice. -->
<span class={`severity severity--${severity}`}>
	<svg
		class="severity__icon"
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
			<path d="M8 4.8v3.7M8 11.1v.1" />
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
	{label}
</span>
