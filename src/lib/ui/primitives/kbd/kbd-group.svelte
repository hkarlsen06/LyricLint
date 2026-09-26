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

<!-- A `kbd` of `kbd`s is HTML's own markup for a key combination. -->
<kbd bind:this={ref} data-slot="kbd-group" class={['kbd-group', className]} {...restProps}>
	{@render children?.()}
</kbd>

<style>
	.kbd-group {
		display: inline-flex;
		gap: var(--space-1);
		align-items: baseline;
		white-space: nowrap;
	}
</style>
