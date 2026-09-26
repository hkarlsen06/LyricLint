<script lang="ts">
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLThAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLThAttributes> = $props();
</script>

<th bind:this={ref} data-slot="table-head" class={['table-head', className]} {...restProps}>
	{@render children?.()}
</th>

<style>
	.table-head {
		padding: var(--space-2) var(--space-3);
		border-block-end: var(--border-width) solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
		text-align: start;
		vertical-align: bottom;
	}

	/* The first column starts on the prose edge rather than inset from it. */
	.table-head:first-child {
		padding-inline-start: 0;
	}
</style>
