<script lang="ts">
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<kbd bind:this={ref} data-slot="kbd" class={['kbd', className]} {...restProps}>
	{@render children?.()}
</kbd>

<style>
	/*
	 * A key sits on the prose line in the prose's own face and size (DESIGN.md,
	 * Typography): base.css sets `kbd { font: inherit }`, and nothing here moves
	 * it off the baseline. The key is a flat fill with the control ring, no
	 * vertical padding, so a line holding one is exactly as tall as one without.
	 */
	.kbd {
		display: inline-block;
		padding-inline: var(--space-1);
		border-radius: var(--radius-xs);
		background: var(--color-fill);
		box-shadow: var(--shadow-control);
		color: var(--color-text);
		font-weight: var(--font-weight-medium);
		text-align: center;
		white-space: nowrap;
	}
</style>
