<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		value = $bindable(''),
		class: className,
		...restProps
	}: TabsPrimitive.RootProps = $props();
</script>

<TabsPrimitive.Root
	bind:ref
	bind:value
	data-slot="tabs"
	class={['ui-tabs', className]}
	{...restProps}
/>

<style>
	/* Bits UI renders the element, so the class is global. */
	:global(.ui-tabs) {
		display: flex;
		margin-block-end: var(--space-4);
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
