<script lang="ts">
	/**
	 * The /rules/ modal shell. Bits UI owns focus trapping, Escape/outside-press
	 * dismissal, and focus restoration; AssistantConversation owns everything
	 * below this header and is shared verbatim with the workbench panel.
	 */
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import { Dialog } from 'bits-ui';
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import AssistantChatControls from './AssistantChatControls.svelte';
	import AssistantConversation from './AssistantConversation.svelte';

	let { assistant }: { assistant: AssistantState } = $props();

	let conversation = $state<{ focusComposer(): void }>();
</script>

<Dialog.Root
	open={assistant.isOpen}
	onOpenChange={(open) => {
		if (!open) assistant.close();
	}}
>
	<Dialog.Overlay class="assistant-dialog-overlay" />
	<Dialog.Content
		class="assistant-dialog"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			conversation?.focusComposer();
		}}
	>
		<div class="assistant-dialog__surface">
			<header class="assistant-dialog__header">
				<!--
					One name, true from all three ways in. This modal opens from the
					linter rules, from the guidance catalog (whose own spark says
					"Ask about the transcription guidelines") and from the workbench,
					so a title naming the rules alone was false from two of them, and
					it contradicted the subtitle sitting directly under it. The pair
					names the assistant and then says what it covers, rather than
					plumbing a different title through per section: what the reader
					can ask does not change with the door they came in by.
				-->
				<div class="assistant-dialog__title">
					<Dialog.Title class="assistant-dialog__heading">Ask LyricLint</Dialog.Title>
					<p>About the rules and transcription guidelines</p>
				</div>
				<div class="assistant-dialog__commands">
					<AssistantChatControls
						{assistant}
						onConversationEmptied={() => conversation?.focusComposer()}
					/>
					<Dialog.Close class="icon-button button--quiet" aria-label="Close">
						<XIcon aria-hidden="true" size={12} weight="bold" />
					</Dialog.Close>
				</div>
			</header>
			<AssistantConversation bind:this={conversation} {assistant} />
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	/* Bits UI renders the content and overlay elements, so their classes are
	   global. */
	:global(.assistant-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: var(--layer-picker);
		transform: translate(-50%, -50%);
		width: min(46rem, calc(100vw - var(--space-4)));
		height: min(42rem, calc(100dvh - var(--space-6)));
		max-height: 52rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		box-shadow: var(--shadow-overlay);
		color: var(--color-text);
	}

	:global(.assistant-dialog-overlay) {
		position: fixed;
		inset: 0;
		z-index: calc(var(--layer-picker) - 1);
		background: var(--color-backdrop);
	}

	.assistant-dialog__surface {
		display: flex;
		height: 100%;
		min-height: 0;
		flex-direction: column;
	}

	/* The header splits on what a control acts on: the identity at one end, the
	 * commands at the other. No icon tile, because a decorated box beside a title
	 * separates nothing. */
	.assistant-dialog__header {
		display: flex;
		padding: var(--space-4) var(--space-4) var(--space-2) var(--space-5);
		align-items: center;
		gap: var(--space-2);
	}

	.assistant-dialog__title {
		display: flex;
		min-width: 0;
		align-items: baseline;
		gap: var(--space-2);
	}

	.assistant-dialog__title :global(.assistant-dialog__heading) {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
	}

	.assistant-dialog__title p {
		margin: 0;
		overflow: hidden;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.assistant-dialog__commands {
		display: flex;
		margin-inline-start: auto;
		align-items: center;
		gap: var(--space-1);
	}

	@media (max-width: 36rem) {
		:global(.assistant-dialog) {
			width: calc(100vw - var(--space-2));
			height: calc(100dvh - var(--space-2));
		}

		.assistant-dialog__header {
			padding-inline: var(--space-3);
		}

		.assistant-dialog__title p {
			display: none;
		}
	}
</style>
