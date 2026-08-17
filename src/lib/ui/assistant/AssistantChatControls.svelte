<script lang="ts">
	import { Clock3, Plus } from 'lucide-svelte';
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
				<Clock3 aria-hidden="true" size={15} strokeWidth={2.25} />
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
							{/if}
							<div class="list-row__commands">
								<!-- The `RemoveButton` stays the same instance across the arming,
								     as the drafts menu and the roster keep theirs: mounted afresh
								     with `pending` already true, its live region is *born* holding
								     the question, and a region that never changes announces
								     nothing. -->
								<RemoveButton
									subject={chat.title}
									pending={deleteChatId === chat.id}
									onRequest={() => (deleteChatId = chat.id)}
									onCancel={() => (deleteChatId = undefined)}
									onConfirm={() => deleteChat(chat.id)}
								/>
							</div>
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
		<Plus aria-hidden="true" size={15} strokeWidth={2.25} />
	</button>
</div>
