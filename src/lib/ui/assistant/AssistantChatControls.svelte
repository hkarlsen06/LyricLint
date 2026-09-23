<script lang="ts">
	import ClockIcon from 'phosphor-svelte/lib/ClockIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
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
				<ClockIcon aria-hidden="true" size={15} weight="bold" />
			</summary>
			<div class="assistant-chats__popover">
				<h3 class="assistant-chats__heading">Conversations</h3>
				<ul class="assistant-chats__list">
					{#each assistant.chats as chat (chat.id)}
						<li class="list-row" class:current={chat.id === assistant.activeChatId}>
							{#if deleteChatId === chat.id}
								<span class="list-row__action list-row__action--static">
									<span class="list-row__name">{chat.title}</span>
								</span>
							{:else}
								<button
									type="button"
									class="list-row__action"
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
		<PlusIcon aria-hidden="true" size={15} weight="bold" />
	</button>
</div>

<style>
	.assistant-chat-controls {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	/* The conversations popover: the drafts menu's shape, a quiet disclosure, one
	 * line per chat, commands as glyphs on the name's own line. */
	.assistant-chats {
		position: relative;
	}

	.assistant-chats > summary {
		list-style: none;
	}

	.assistant-chats > summary::-webkit-details-marker {
		display: none;
	}

	.assistant-chats__trigger {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.assistant-chats__popover {
		position: absolute;
		z-index: var(--layer-menu);
		top: calc(100% + var(--space-2));
		right: 0;
		width: min(24rem, calc(100vw - 2rem));
		max-height: min(24rem, 60vh);
		padding: var(--space-2);
		overflow: auto;
		border: 0;
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		box-shadow: var(--shadow-overlay);
	}

	/* In the workbench this control lives in the narrow panel, whose left edge is
	 * also a clipping boundary. Cap the popover to that host rather than only to
	 * the viewport; at large text sizes 24rem can otherwise extend under the
	 * editor and the start of every row disappears. The menu is anchored to the
	 * history control, so its available width also reserves the panel's two
	 * insets, the New chat control to its right, and the gap between them. */
	:global(.assistant-panel) .assistant-chats__popover {
		width: min(24rem, calc(100cqi - 2 * var(--space-3) - 2rem - var(--space-1)));
	}

	.assistant-chats__heading {
		padding: var(--space-1) var(--space-2) var(--space-2);
		margin: 0 0 var(--space-1);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.assistant-chats__list {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.assistant-chats__list > li.current .list-row__name {
		font-weight: var(--font-weight-bold);
	}
</style>
