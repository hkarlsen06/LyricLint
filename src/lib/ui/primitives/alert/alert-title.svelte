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

<div bind:this={ref} data-slot="alert-title" class={['alert__title', className]} {...restProps}>
	{@render children?.()}
</div>

<style>
	.alert__title {
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}
</style>
