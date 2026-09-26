<script lang="ts" module>
	export type SheetSide = 'left' | 'right';
</script>

<script lang="ts">
	import { Dialog as SheetPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import type { Snippet } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		side = 'right',
		children,
		...restProps
	}: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
		side?: SheetSide;
		children: Snippet;
	} = $props();
</script>

<!-- No portal, unlike shadcn's: `.site` pins the site's own palette on its
     subtree, and a sheet moved to `<body>` would render in whichever scheme the
     reader's system asks for. Bits UI owns focus trapping, Escape and
     outside-press dismissal (the overlay), and focus restoration. -->
<SheetPrimitive.Overlay class="ui-sheet-overlay" />
<SheetPrimitive.Content
	bind:ref
	data-slot="sheet-content"
	data-side={side}
	class={['ui-sheet', className]}
	{...restProps}
>
	{@render children?.()}
	<SheetPrimitive.Close class="icon-button button--quiet ui-sheet__close" aria-label="Close">
		<XIcon aria-hidden="true" size={12} weight="bold" />
	</SheetPrimitive.Close>
</SheetPrimitive.Content>

<style>
	:global(.ui-sheet-overlay) {
		position: fixed;
		inset: 0;
		z-index: calc(var(--layer-picker) - 1);
		background: var(--color-backdrop);
	}

	:global(.ui-sheet) {
		position: fixed;
		inset-block: 0;
		z-index: var(--layer-picker);
		display: flex;
		width: min(20rem, calc(100vw - var(--space-8)));
		padding: var(--space-3) var(--space-4) var(--space-5);
		flex-direction: column;
		gap: var(--space-3);
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--color-overlay);
		box-shadow: var(--shadow-overlay);
		color: var(--color-text);
		padding-block-start: max(var(--space-3), env(safe-area-inset-top));
		padding-block-end: max(var(--space-5), env(safe-area-inset-bottom));
	}

	:global(.ui-sheet[data-side='left']) {
		inset-inline-start: 0;
	}

	:global(.ui-sheet[data-side='right']) {
		inset-inline-end: 0;
	}

	:global(.ui-sheet__close) {
		position: absolute;
		inset-block-start: max(var(--space-3), env(safe-area-inset-top));
		inset-inline-end: var(--space-3);
	}

	@media (prefers-reduced-motion: no-preference) {
		:global(.ui-sheet[data-state='open'][data-side='left']) {
			animation: ui-sheet-in-left var(--duration-slow) var(--ease-out-quart);
		}

		:global(.ui-sheet[data-state='open'][data-side='right']) {
			animation: ui-sheet-in-right var(--duration-slow) var(--ease-out-quart);
		}
	}

	@keyframes -global-ui-sheet-in-left {
		from {
			transform: translateX(-100%);
		}
	}

	@keyframes -global-ui-sheet-in-right {
		from {
			transform: translateX(100%);
		}
	}
</style>
