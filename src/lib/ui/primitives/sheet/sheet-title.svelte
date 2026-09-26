<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.TitleProps = $props();
</script>

<SheetPrimitive.Title
	bind:ref
	data-slot="sheet-title"
	class={['ui-sheet__title', className]}
	{...restProps}
/>

<style>
	:global(.ui-sheet__title) {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}
</style>
