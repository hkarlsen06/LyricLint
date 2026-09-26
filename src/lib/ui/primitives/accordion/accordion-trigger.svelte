<script lang="ts">
	import { Accordion as AccordionPrimitive, type WithoutChild } from 'bits-ui';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';

	let {
		ref = $bindable(null),
		class: className,
		level = 3,
		children,
		...restProps
	}: WithoutChild<AccordionPrimitive.TriggerProps> & {
		level?: AccordionPrimitive.HeaderProps['level'];
	} = $props();
</script>

<AccordionPrimitive.Header {level} class="ui-accordion__header">
	<AccordionPrimitive.Trigger
		bind:ref
		data-slot="accordion-trigger"
		class={['ui-accordion__trigger', className]}
		{...restProps}
	>
		<span>{@render children?.()}</span>
		<CaretDownIcon class="ui-accordion__icon" aria-hidden="true" size="1em" weight="bold" />
	</AccordionPrimitive.Trigger>
</AccordionPrimitive.Header>

<style>
	/* Two classes, so the page's own `h3` rhythm (`.site-prose h3`) does not
	   reach a heading that is only a wrapper around the trigger. */
	:global(.ui-accordion .ui-accordion__header) {
		margin: 0;
		font: inherit;
	}

	/* The open state is carried by the caret's direction and `aria-expanded`,
	   not by color. */
	:global(.ui-accordion__trigger) {
		display: flex;
		width: 100%;
		padding: var(--space-3) 0;
		border: 0;
		gap: var(--space-3);
		align-items: center;
		justify-content: space-between;
		background: transparent;
		color: var(--color-text);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-tight);
		text-align: start;
	}

	:global(.ui-accordion__trigger:hover > span) {
		text-decoration: underline;
		text-underline-offset: 0.16em;
	}

	:global(.ui-accordion__icon) {
		flex: none;
		color: var(--color-text-muted);
	}

	:global(.ui-accordion__trigger[data-state='open'] .ui-accordion__icon) {
		transform: rotate(180deg);
	}

	@media (prefers-reduced-motion: no-preference) {
		:global(.ui-accordion__icon) {
			transition: transform var(--duration-medium) var(--ease-out-quart);
		}
	}
</style>
