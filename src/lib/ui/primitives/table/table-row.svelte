<script lang="ts">
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableRowElement>> = $props();
</script>

<tr bind:this={ref} data-slot="table-row" class={['table-row', className]} {...restProps}>
	{@render children?.()}
</tr>

<style>
	/* Rows repeat, so a hairline between them is a real grouping. */
	.table-row {
		border-block-end: var(--border-width) solid var(--color-border);
	}
</style>
