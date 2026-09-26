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

<caption
	bind:this={ref}
	data-slot="table-caption"
	class={['table-caption', className]}
	{...restProps}
>
	{@render children?.()}
</caption>

<style>
	.table-caption {
		margin-block-start: var(--space-2);
		caption-side: bottom;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		text-align: start;
	}
</style>
