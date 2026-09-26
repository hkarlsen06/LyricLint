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

<div bind:this={ref} data-slot="sheet-header" class={['sheet-header', className]} {...restProps}>
	{@render children?.()}
</div>

<style>
	/* The end padding leaves the content's own close control a clear corner. */
	.sheet-header {
		display: flex;
		min-height: var(--control-height-touch);
		padding-inline-end: calc(var(--control-height-touch) + var(--space-2));
		gap: var(--space-2);
		align-items: center;
	}
</style>
