<script lang="ts">
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLTdAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLTdAttributes> = $props();
</script>

<td bind:this={ref} data-slot="table-cell" class={['table-cell', className]} {...restProps}>
	{@render children?.()}
</td>

<style>
	.table-cell {
		padding: var(--space-2) var(--space-3);
		vertical-align: top;
	}

	.table-cell:first-child {
		padding-inline-start: 0;
	}
</style>
