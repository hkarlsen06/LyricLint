<script lang="ts">
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLTableAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLTableAttributes> = $props();
</script>

<!-- The container scrolls sideways on a narrow screen, so a wide table never
     widens the page. -->
<div data-slot="table-container" class="table-container">
	<table bind:this={ref} data-slot="table" class={['table', className]} {...restProps}>
		{@render children?.()}
	</table>
</div>

<style>
	.table-container {
		width: 100%;
		margin-block-end: var(--space-4);
		overflow-x: auto;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
	}
</style>
