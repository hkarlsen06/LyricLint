<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={['ui-tabs__trigger', className]}
	{...restProps}
/>

<style>
	/*
	 * Selection is carried by the trigger becoming an object (a raised surface
	 * with the control shadow) against an unfilled track, not by its ink alone.
	 * The weight never changes, so selecting a tab moves nothing beside it.
	 */
	:global(.ui-tabs__trigger) {
		display: inline-flex;
		min-height: var(--control-height-sm);
		padding: var(--space-1) var(--space-3);
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-control);
		gap: var(--control-gap);
		align-items: center;
		justify-content: center;
		background: transparent;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-ui);
		white-space: nowrap;
	}

	:global(.ui-tabs__trigger:hover:not(:disabled)) {
		color: var(--color-text);
	}

	:global(.ui-tabs__trigger[data-state='active']) {
		background: var(--color-surface);
		box-shadow: var(--shadow-control);
		color: var(--color-text);
	}

	:global(.ui-tabs__trigger:disabled) {
		border-color: transparent;
		background: transparent;
		color: var(--color-text-disabled);
	}

	@media (pointer: coarse) {
		:global(.ui-tabs__trigger) {
			min-height: var(--control-height-touch);
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		:global(.ui-tabs__trigger) {
			transition:
				background-color var(--duration-fast) var(--ease-out-quart),
				box-shadow var(--duration-fast) var(--ease-out-quart),
				color var(--duration-fast) var(--ease-out-quart);
		}
	}
</style>
