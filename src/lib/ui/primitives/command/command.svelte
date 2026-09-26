<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		value = $bindable(''),
		class: className,
		...restProps
	}: CommandPrimitive.RootProps = $props();
</script>

<CommandPrimitive.Root
	bind:value
	bind:ref
	data-slot="command"
	class={['ui-command', className]}
	{...restProps}
/>

<style>
	:global(.ui-command) {
		display: flex;
		width: 100%;
		height: 100%;
		flex-direction: column;
		overflow: hidden;
		color: var(--color-text);
	}
</style>
