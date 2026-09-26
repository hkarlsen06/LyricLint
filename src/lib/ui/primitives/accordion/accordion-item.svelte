<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AccordionPrimitive.ItemProps = $props();
</script>

<AccordionPrimitive.Item
	bind:ref
	data-slot="accordion-item"
	class={['ui-accordion__item', className]}
	{...restProps}
/>

<style>
	/* The hairline separates items that repeat; the last one has nothing after
	   it to separate. */
	:global(.ui-accordion__item) {
		border-block-end: var(--border-width) solid var(--color-border);
	}

	:global(.ui-accordion__item:last-child) {
		border-block-end: 0;
	}
</style>
