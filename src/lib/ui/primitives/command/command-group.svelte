<script lang="ts">
	import { Command as CommandPrimitive } from 'bits-ui';

	const uid = $props.id();

	let {
		ref = $bindable(null),
		class: className,
		children,
		heading,
		value,
		...restProps
	}: CommandPrimitive.GroupProps & { heading?: string } = $props();
</script>

<CommandPrimitive.Group
	bind:ref
	data-slot="command-group"
	class={['ui-command__group', className]}
	value={value ?? heading ?? `----${uid}`}
	{...restProps}
>
	{#if heading}
		<CommandPrimitive.GroupHeading class="ui-command__group-heading">
			{heading}
		</CommandPrimitive.GroupHeading>
	{/if}
	<CommandPrimitive.GroupItems {children} />
</CommandPrimitive.Group>

<style>
	:global(.ui-command__group + .ui-command__group) {
		margin-block-start: var(--space-2);
	}

	/* Names the run of options under it, in sentence case, at the metadata size. */
	:global(.ui-command__group-heading) {
		padding: var(--space-2) var(--space-3) var(--space-1);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}
</style>
