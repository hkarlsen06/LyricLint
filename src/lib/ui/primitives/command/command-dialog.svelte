<script lang="ts">
	import { Dialog as DialogPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
	import type { Command as CommandPrimitive } from 'bits-ui';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import type { Snippet } from 'svelte';
	import Command from './command.svelte';

	let {
		open = $bindable(false),
		ref = $bindable(null),
		value = $bindable(''),
		title = 'Command palette',
		description = 'Search for a command to run',
		onOpenChange,
		children,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.RootProps> &
		WithoutChildrenOrChild<CommandPrimitive.RootProps> & {
			title?: string;
			description?: string;
			children: Snippet;
		} = $props();
</script>

<!-- No portal, for the reason `sheet-content.svelte` gives: the site's pinned
     palette lives on `.site`. Bits UI's dialog owns focus trapping, Escape, the
     outside press (the overlay), and focus restoration; the close control is
     the third way out. -->
<DialogPrimitive.Root bind:open {onOpenChange}>
	<DialogPrimitive.Overlay class="ui-command-dialog-overlay" />
	<DialogPrimitive.Content class="ui-command-dialog">
		<DialogPrimitive.Title class="sr-only">{title}</DialogPrimitive.Title>
		<DialogPrimitive.Description class="sr-only">{description}</DialogPrimitive.Description>
		<Command bind:value bind:ref {...restProps}>
			{@render children?.()}
		</Command>
		<DialogPrimitive.Close
			class="icon-button button--quiet ui-command-dialog__close"
			aria-label="Close"
		>
			<XIcon aria-hidden="true" size={12} weight="bold" />
		</DialogPrimitive.Close>
	</DialogPrimitive.Content>
</DialogPrimitive.Root>

<style>
	:global(.ui-command-dialog-overlay) {
		position: fixed;
		inset: 0;
		z-index: calc(var(--layer-picker) - 1);
		background: var(--color-backdrop);
	}

	/* Anchored near the top rather than centred, so the field stays put while
	   the result list below it grows and shrinks with each keystroke. */
	:global(.ui-command-dialog) {
		position: fixed;
		inset-block-start: max(var(--space-8), 12dvh);
		left: 50%;
		z-index: var(--layer-picker);
		width: min(36rem, calc(100vw - var(--space-4)));
		overflow: hidden;
		transform: translateX(-50%);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		box-shadow: var(--shadow-overlay);
		color: var(--color-text);
	}

	/* The close control sits at the end of the search row; the row leaves it
	   the room. */
	:global(.ui-command-dialog .ui-command__input-row) {
		padding-inline-end: calc(var(--control-height-touch) + var(--space-2));
	}

	:global(.ui-command-dialog__close) {
		position: absolute;
		inset-block-start: calc((var(--control-height-touch) - var(--control-height-md)) / 2);
		inset-inline-end: var(--space-2);
	}

	@media (max-width: 36rem) {
		:global(.ui-command-dialog) {
			inset-block-start: var(--space-2);
			width: calc(100vw - var(--space-2));
		}
	}
</style>
