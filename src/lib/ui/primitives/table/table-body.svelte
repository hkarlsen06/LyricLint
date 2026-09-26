<script lang="ts">
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> = $props();
</script>

<tbody bind:this={ref} data-slot="table-body" class={['table-body', className]} {...restProps}>
	{@render children?.()}
</tbody>

<style>
	.table-body > :global(tr:last-child) {
		border-block-end: 0;
	}
</style>
