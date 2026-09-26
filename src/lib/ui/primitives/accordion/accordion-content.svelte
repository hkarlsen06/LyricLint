<script lang="ts">
	import { Accordion as AccordionPrimitive, type WithoutChild } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithoutChild<AccordionPrimitive.ContentProps> = $props();
</script>

<AccordionPrimitive.Content
	bind:ref
	data-slot="accordion-content"
	class={['ui-accordion__content', className]}
	{...restProps}
>
	<div class="ui-accordion__body">
		{@render children?.()}
	</div>
</AccordionPrimitive.Content>

<style>
	/* The panel grows below its trigger; nothing above it moves. */
	.ui-accordion__body {
		padding-block-end: var(--space-4);
	}

	.ui-accordion__body > :global(:last-child) {
		margin-block-end: 0;
	}
</style>
