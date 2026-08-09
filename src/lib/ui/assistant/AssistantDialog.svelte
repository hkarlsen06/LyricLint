<script lang="ts">
	/**
	 * The /rules/ modal shell. Bits UI owns focus trapping, Escape/outside-press
	 * dismissal, and focus restoration; AssistantConversation owns everything
	 * below this header and is shared verbatim with the workbench panel.
	 */
	import { X } from 'lucide-svelte';
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
				<div class="assistant-dialog__title">
					<Dialog.Title class="assistant-dialog__heading">Ask the rules</Dialog.Title>
					<p>LyricLint’s guidelines assistant</p>
				</div>
				<div class="assistant-dialog__commands">
					<AssistantChatControls
						{assistant}
						onConversationEmptied={() => conversation?.focusComposer()}
					/>
					<Dialog.Close class="icon-button button--quiet" aria-label="Close">
						<X aria-hidden="true" size={12} strokeWidth={3} />
					</Dialog.Close>
				</div>
			</header>
			<AssistantConversation bind:this={conversation} {assistant} />
		</div>
	</Dialog.Content>
</Dialog.Root>
