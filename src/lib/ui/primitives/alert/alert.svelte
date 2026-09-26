<script lang="ts" module>
	export type AlertVariant = 'default' | 'note';
</script>

<script lang="ts">
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { variant?: AlertVariant } = $props();
</script>

<!-- `note`, not shadcn's `alert`: this is a static aside read in place, and an
     `alert` role is a live region for something that just happened. -->
<div
	bind:this={ref}
	data-slot="alert"
	role="note"
	class={['alert', `alert--${variant}`, className]}
	{...restProps}
>
	{@render children?.()}
</div>

<style>
	/* A region set apart from the prose around it, which is what earns the fill.
	   The note variant adds a bar at its leading edge, so the difference is a
	   shape and not a tint alone. */
	.alert {
		display: grid;
		margin-block-end: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-panel);
		gap: var(--space-1);
		background: var(--color-fill-subtle);
		color: var(--color-text);
	}

	.alert--note {
		background: var(--color-warning-soft);
		box-shadow: inset var(--space-1) 0 0 var(--color-warning);
	}
</style>
