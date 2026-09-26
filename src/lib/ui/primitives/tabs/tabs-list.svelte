<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	let { ref = $bindable(null), class: className, ...restProps }: TabsPrimitive.ListProps = $props();
</script>

<TabsPrimitive.List
	bind:ref
	data-slot="tabs-list"
	class={['ui-tabs__list', className]}
	{...restProps}
/>

<style>
	/* A recessed track the selected trigger rises out of. It scrolls sideways
	   rather than wrapping, so a long label never pushes the panel below down. */
	:global(.ui-tabs__list) {
		display: inline-flex;
		width: fit-content;
		max-width: 100%;
		padding: var(--space-1);
		border-radius: var(--radius-md);
		gap: var(--space-1);
		overflow-x: auto;
		background: var(--color-fill-subtle);
		scrollbar-width: none;
	}
</style>
