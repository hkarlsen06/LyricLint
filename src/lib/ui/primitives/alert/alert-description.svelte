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

<div
	bind:this={ref}
	data-slot="alert-description"
	class={['alert__description', className]}
	{...restProps}
>
	{@render children?.()}
</div>

<style>
	.alert__description > :global(:last-child) {
		margin-block-end: 0;
	}
</style>
