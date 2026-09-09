<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import type { ScreenRect } from '../contracts.js';
	import { anchoredPosition } from './anchored-position.js';
	import { dismissOnHoverLeave } from './dismiss-on-hover-leave.js';

	let {
		anchor,
		takeFocus,
		hover,
		onDismiss,
		onFocus,
		children
	}: {
		anchor?: ScreenRect;
		takeFocus: boolean;
		hover: boolean;
		onDismiss: (returnFocus: boolean) => void;
		onFocus: () => void;
		children: Snippet;
	} = $props();
	let root: HTMLDivElement;
	const position = $derived(anchor ? anchoredPosition(anchor) : undefined);

	onMount(() => {
		if (takeFocus) root.focus();
		// Escape must also cancel a pointer-opened request whose focus stayed in
		// the lyrics. This listener exists only while a pending surface is drawn.
		const escape = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return;
			event.preventDefault();
			event.stopPropagation();
			onDismiss(true);
		};
		window.addEventListener('keydown', escape, true);
		return () => window.removeEventListener('keydown', escape, true);
	});
</script>

<div
	bind:this={root}
	class="pending-overlay"
	class:anchored={anchor}
	style={position}
	role={takeFocus ? 'dialog' : 'group'}
	aria-label="Editor controls"
	tabindex="-1"
	onfocusin={onFocus}
	{@attach dismissOnOutside(() => onDismiss(false))}
	{@attach dismissOnHoverLeave({
		anchor,
		takeFocus: takeFocus || !hover,
		onDismiss: () => onDismiss(false)
	})}
>
	{@render children()}
	<button type="button" class="button button--quiet" onclick={() => onDismiss(true)}>Cancel</button>
</div>

<style>
	.pending-overlay {
		--ll-card-width: min(var(--measure-prose), calc(100vw - var(--space-4)));
		--ll-anchor-space: calc(100dvh - var(--space-4));
		position: fixed;
		z-index: var(--layer-picker);
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: var(--ll-card-width);
		max-height: var(--ll-anchor-space);
		overflow-y: auto;
		padding: var(--space-4);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}
	.pending-overlay.anchored {
		top: auto;
		left: auto;
		transform: none;
	}
	.pending-overlay:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}
</style>
