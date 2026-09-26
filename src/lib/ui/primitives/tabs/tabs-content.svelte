<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.ContentProps = $props();
</script>

<TabsPrimitive.Content
	bind:ref
	data-slot="tabs-content"
	class={['ui-tabs__content', className]}
	{...restProps}
/>

<style>
	/* A panel's last paragraph keeps no trailing margin of its own; the root
	   spaces the block from what follows. */
	:global(.ui-tabs__content > :last-child) {
		margin-block-end: 0;
	}
</style>
