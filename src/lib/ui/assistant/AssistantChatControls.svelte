<script lang="ts">
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import RemoveButton from '$lib/ui/primitives/RemoveButton.svelte';
	import { formatDraftDate, fullDraftDate } from '$lib/ui/drafts/draft-date.js';

	let {
		assistant,
		onConversationEmptied
	}: {
		assistant: AssistantState;
		onConversationEmptied?: () => void;
	} = $props();

	let chatsOpen = $state(false);
	let chatsTrigger = $state<HTMLElement>();
	let deleteChatId = $state<string | undefined>();

	function dismissChats(): void {
		if (!chatsOpen) return;
		chatsOpen = false;
		deleteChatId = undefined;
	}

	function openChat(id: string): void {
		chatsOpen = false;
		deleteChatId = undefined;
		void assistant.selectChat(id);
	}

	async function deleteChat(id: string): Promise<void> {
		await assistant.deleteChat(id);
		deleteChatId = undefined;
		if (assistant.chats.length === 0) {
			chatsOpen = false;
			onConversationEmptied?.();
		} else {
			chatsTrigger?.focus();
		}
	}
</script>

<div class="assistant-chat-controls">
	{#if assistant.chats.length > 0}
		<details class="assistant-chats" bind:open={chatsOpen} {@attach dismissOnOutside(dismissChats)}>
			<!-- svelte-ignore a11y_no_redundant_roles -->
			<summary
				class="button--quiet icon-button assistant-chats__trigger"
				role="button"
				aria-label="Conversations"
				title="Conversations"
				aria-expanded={chatsOpen}
				bind:this={chatsTrigger}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="15"
					height="15"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<circle cx="8" cy="8" r="5.6" />
					<path d="M8 5.2V8l2 1.6" />
				</svg>
			</summary>
			<div class="assistant-chats__popover">
				<h3 class="assistant-chats__heading">Conversations</h3>
				<ul class="assistant-chats__list">
					{#each assistant.chats as chat (chat.id)}
						<li class="list-row" class:current={chat.id === assistant.activeChatId}>
							{#if deleteChatId === chat.id}
								<span class="assistant-chats__name assistant-chats__name--static">
									<span class="list-row__name">{chat.title}</span>
								</span>
								<div class="list-row__commands">
									<RemoveButton
										subject={chat.title}
										pending
										onRequest={() => (deleteChatId = chat.id)}
										onCancel={() => (deleteChatId = undefined)}
										onConfirm={() => deleteChat(chat.id)}
									/>
								</div>
							{:else}
								<button
									type="button"
									class="assistant-chats__name"
									aria-current={chat.id === assistant.activeChatId ? 'true' : undefined}
									onclick={() => openChat(chat.id)}
								>
									<span class="list-row__name">{chat.title}</span>
									<time datetime={chat.updatedAt} title={fullDraftDate(chat.updatedAt)}>
										{formatDraftDate(chat.updatedAt)}
									</time>
								</button>
								<div class="list-row__commands">
									<RemoveButton
										subject={chat.title}
										pending={false}
										onRequest={() => (deleteChatId = chat.id)}
										onCancel={() => (deleteChatId = undefined)}
										onConfirm={() => deleteChat(chat.id)}
									/>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		</details>
	{/if}
	<button
		type="button"
		class="button--quiet icon-button"
		disabled={assistant.busy || assistant.challengePending}
		aria-label="New chat"
		title="New chat"
		onclick={() => void assistant.newChat()}
	>
		<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
			<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
		</svg>
	</button>
</div>
