<script lang="ts">
	import X from 'lucide-svelte/icons/x';
	import { tick } from 'svelte';
	import LazyContent from '$lib/interaction/LazyContent.svelte';
	import type { MediaStore } from '../state/media-store.svelte.js';

	let { media, draftTitle }: { media: MediaStore; draftTitle?: string } = $props();
	let dialog: HTMLDialogElement;
	let opener: HTMLButtonElement | undefined;
	let focusReplacement: (() => void) | undefined;
	let isOpen = $state(false);
	let resumedQuery = $state<string>();
	const queries = $state({ spotify: '', apple: '' });
	const label = $derived(
		media.player.attached || media.pendingName ? 'Change audio source' : 'Add audio source'
	);

	export async function open(
		source?: HTMLButtonElement,
		fallbackFocus?: () => void
	): Promise<void> {
		opener = source;
		focusReplacement = fallbackFocus;
		resumedQuery = undefined;
		// Prepare Apple's SDK during the opening gesture, before loading the forms.
		media.prepareAppleMusic();
		isOpen = true;
		dialog.showModal();
		await tick();
	}

	// Reading clears the resumed query. Keep this listener mounted while closed.
	$effect(() => {
		const resumed = media.takeResumedQuery();
		if (resumed === undefined) return;
		void open();
		resumedQuery = resumed;
	});

	function close(): void {
		isOpen = false;
		dialog.close();
		// Attaching can replace the opener; restore focus after that render.
		void tick().then(() => {
			if (opener?.isConnected) opener.focus();
			else focusReplacement?.();
		});
	}

	function dismissOnBackdrop(event: MouseEvent): void {
		if (event.target === dialog) {
			isOpen = false;
			dialog.close();
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="media-dialog"
	aria-labelledby="media-dialog-title"
	onclick={dismissOnBackdrop}
	onclose={(event) => (isOpen = event.currentTarget.open)}
>
	{#if isOpen}
		<div class="media-dialog__surface">
			<div class="media-dialog__header">
				<h2 id="media-dialog-title">{label}</h2>
				<button type="button" class="icon-button button--quiet" aria-label="Close" onclick={close}>
					<X aria-hidden="true" size={16} strokeWidth={2.25} />
				</button>
			</div>

			<LazyContent
				name="audio sources"
				load={() => import('./MediaPickerBody.svelte')}
				panelProps={{
					media,
					draftTitle,
					queries,
					resumedQuery,
					onClose: close,
					active: () => dialog.open
				}}
			>
				{#snippet pendingSurface(content)}
					<div class="media-dialog__pending">{@render content()}</div>
				{/snippet}
			</LazyContent>
		</div>
	{/if}
</dialog>

<style>
	.media-dialog {
		width: min(30rem, calc(100vw - var(--space-4)));
		max-width: none;
		padding: 0;
		border: 0;
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}

	.media-dialog::backdrop {
		background: var(--color-backdrop);
	}

	/* The title sits on the body rather than in a band of its own: a rule under a
	   header of this height is chrome around four lines of content. */
	.media-dialog__header {
		display: flex;
		padding: var(--space-4) var(--space-4) var(--space-2) var(--space-5);
		align-items: center;
		justify-content: space-between;
	}

	.media-dialog__header h2 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
	}

	.media-dialog__pending {
		padding: var(--space-3) var(--space-5) var(--space-5);
	}
</style>
