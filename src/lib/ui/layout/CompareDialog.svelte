<script lang="ts">
	import Diff from 'lucide-svelte/icons/diff';
	import X from 'lucide-svelte/icons/x';
	import LazyPanel from '$lib/interaction/LazyContent.svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	let dialog: HTMLDialogElement;
	let trigger = $state<HTMLButtonElement>();
	let isOpen = $state(false);

	function open(): void {
		isOpen = true;
		dialog.showModal();
	}

	function close(): void {
		isOpen = false;
		dialog.close();
		trigger?.focus();
	}
</script>

{#if !controller.isEmpty}
	<button
		bind:this={trigger}
		type="button"
		class="button button--quiet compare-trigger"
		aria-haspopup="dialog"
		onclick={open}
	>
		<Diff aria-hidden="true" size={16} strokeWidth={2} />
		Compare
	</button>
{/if}

<dialog
	bind:this={dialog}
	class="compare-dialog"
	aria-labelledby="compare-dialog-title"
	onclick={(event) => {
		if (event.target === dialog) close();
	}}
	onclose={() => {
		// A queued close event may arrive after a new press has reopened the dialog.
		if (dialog && !dialog.open) isOpen = false;
	}}
>
	<div class="compare-dialog__surface">
		<div class="compare-dialog__header">
			<strong id="compare-dialog-title">Compare with the page</strong>
			<button type="button" class="icon-button button--quiet" aria-label="Close" onclick={close}>
				<X aria-hidden="true" size={16} strokeWidth={2.25} />
			</button>
		</div>
		{#if isOpen}
			<LazyPanel
				name="comparison"
				load={() => import('./CompareDialogBody.svelte')}
				panelProps={{ controller, close }}
			>
				{#snippet pendingSurface(content)}
					<div class="compare-dialog__pending">{@render content()}</div>
				{/snippet}
			</LazyPanel>
		{/if}
	</div>
</dialog>

<style>
	.compare-trigger {
		white-space: nowrap;
	}

	.compare-trigger :global(svg) {
		flex: none;
		color: var(--color-text-muted);
	}

	.compare-dialog {
		width: min(46rem, calc(100vw - var(--space-4)));
		max-width: none;
		max-height: calc(100dvh - var(--space-6));
		padding: 0;
		border: 0;
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}

	.compare-dialog::backdrop {
		background: var(--color-backdrop);
	}

	.compare-dialog__surface {
		display: grid;
		max-height: calc(100dvh - var(--space-6));
		grid-template-rows: auto auto minmax(0, 1fr);
	}

	.compare-dialog__header {
		display: flex;
		min-height: 3.25rem;
		padding: var(--space-4) var(--space-4) var(--space-2) var(--space-5);
		align-items: center;
		justify-content: space-between;
	}

	.compare-dialog__header strong {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
	}

	.compare-dialog__pending {
		padding: var(--space-3) var(--space-5) var(--space-5);
	}
</style>
