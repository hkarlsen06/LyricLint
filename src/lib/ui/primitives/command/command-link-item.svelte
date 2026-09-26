<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CommandPrimitive.LinkItemProps = $props();
</script>

<CommandPrimitive.LinkItem
	bind:ref
	data-slot="command-item"
	class={['ui-command__item', className]}
	{...restProps}
/>

<style>
	/* The highlighted option is the one with a fill; the others have none. */
	:global(.ui-command__item) {
		display: flex;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-control);
		flex-direction: column;
		gap: var(--space-0-5);
		color: var(--color-text);
		text-decoration: none;
		cursor: pointer;
		outline: none;
	}

	:global(.ui-command__item:hover) {
		color: var(--color-text);
	}

	:global(.ui-command__item[data-selected]) {
		background: var(--color-fill);
	}
</style>
