<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...restProps
	}: AccordionPrimitive.RootProps = $props();
</script>

<AccordionPrimitive.Root
	bind:ref
	bind:value={value as never}
	data-slot="accordion"
	class={['ui-accordion', className]}
	{...restProps}
/>

<style>
	:global(.ui-accordion) {
		margin-block-end: var(--space-4);
	}
</style>
