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

<div bind:this={ref} data-slot="card-title" class={['card__title', className]} {...restProps}>
	{@render children?.()}
</div>

<style>
	.card__title {
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}
</style>
