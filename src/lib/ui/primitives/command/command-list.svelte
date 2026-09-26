<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CommandPrimitive.ListProps = $props();
</script>

<CommandPrimitive.List
	bind:ref
	data-slot="command-list"
	class={['ui-command__list', className]}
	{...restProps}
/>

<style>
	:global(.ui-command__list) {
		max-height: min(26rem, 60dvh);
		padding: var(--space-2);
		overflow-y: auto;
		overscroll-behavior: contain;
		scroll-padding-block: var(--space-2);
	}
</style>
