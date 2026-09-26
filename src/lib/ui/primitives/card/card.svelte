<script lang="ts">
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div bind:this={ref} data-slot="card" class={['card', className]} {...restProps}>
	{@render children?.()}
</div>

<style>
	/* Cards are for items that repeat. A flat raised fill and the control ring
	   are the whole edge; no ruled border. */
	.card {
		display: grid;
		padding: var(--space-4);
		border-radius: var(--radius-panel);
		gap: var(--space-1);
		align-content: start;
		background: var(--color-surface);
		box-shadow: var(--shadow-control);
		color: var(--color-text);
	}
</style>
