<script lang="ts">
	/**
	 * The conversation modal. Bits UI owns focus trapping, Escape/outside-press
	 * dismissal, and focus restoration. Closing never cancels a request — request
	 * state lives in the root-level store.
	 *
	 * Past conversations live in a popover behind one quiet trigger, the drafts
	 * menu's own idiom: one line per chat, and deleting one is a confirm that
	 * takes the trigger's slot rather than a bare `Delete` in the header acting
	 * on the whole conversation without a question.
	 */
	import { resolve } from '$app/paths';
	import { Dialog } from 'bits-ui';
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import {
		loadRulePreviews,
		type RulePreview,
		type RulePreviewSource
	} from '$lib/assistant/rule-previews.js';
	import { renderChallenge, type ChallengeHandle } from '$lib/assistant/turnstile.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import RemoveButton from '$lib/ui/primitives/RemoveButton.svelte';
	import { formatDraftDate, fullDraftDate } from '$lib/ui/drafts/draft-date.js';
	import AssistantAnswer from './AssistantAnswer.svelte';

	let { assistant }: { assistant: AssistantState } = $props();

	let composerInput = $state<HTMLTextAreaElement>();
	let challengeContainer = $state<HTMLDivElement>();
	let draft = $state('');
	let previews = $state<Map<string, RulePreview>>();
	let sources = $state<Map<string, RulePreviewSource>>();
	let referencesFailedToLoad = $state(false);
	let challengeFailedToRun = $state(false);
	let challengeHandle: ChallengeHandle | undefined;
	let chatsOpen = $state(false);
	let chatsTrigger = $state<HTMLElement>();
	let deleteChatId = $state<string | undefined>();

	$effect(() => {
		if (assistant.isOpen) {
			referencesFailedToLoad = false;
			void loadRulePreviews()
				.then((loaded) => {
					previews = loaded.previews;
					sources = loaded.sources;
				})
				.catch(() => {
					referencesFailedToLoad = true;
				});
		}
	});

	// The Turnstile widget mounts only when the backend asked for a challenge —
	// the same rule every third-party load here follows.
	$effect(() => {
		const container = challengeContainer;
		if (!assistant.challengePending || !container) return;
		let cancelled = false;
		challengeFailedToRun = false;
		void renderChallenge(container)
			.then((handle) => {
				if (cancelled) {
					handle.destroy();
					return;
				}
				challengeHandle = handle;
				return handle.token.then((token) => {
					if (!cancelled) void assistant.submitChallenge(token);
				});
			})
			.catch(() => {
				if (!cancelled) challengeFailedToRun = true;
			});
		return () => {
			cancelled = true;
			challengeHandle?.destroy();
			challengeHandle = undefined;
		};
	});

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		const question = draft;
		resetComposer();
		await assistant.send(question);
	}

	function resizeComposer(textarea: HTMLTextAreaElement): void {
		textarea.style.height = 'auto';
		textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
		textarea.style.overflowY = textarea.scrollHeight > 144 ? 'auto' : 'hidden';
	}

	function resetComposer(): void {
		draft = '';
		if (composerInput) {
			composerInput.style.height = 'auto';
			composerInput.style.overflowY = 'hidden';
		}
	}

	function onComposerKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			const question = draft;
			resetComposer();
			void assistant.send(question);
		}
	}

	// Leaving the popover abandons a pending delete confirm — reopening it must
	// not present a primed question the user already walked away from.
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

	// The confirm the press landed on unmounts with the row, so focus has to be
	// handed somewhere deliberate: the popover's own trigger while the list
	// stands, the composer once the last conversation is gone with it.
	async function deleteChat(id: string): Promise<void> {
		await assistant.deleteChat(id);
		deleteChatId = undefined;
		if (assistant.chats.length === 0) {
			chatsOpen = false;
			composerInput?.focus();
		} else {
			chatsTrigger?.focus();
		}
	}

	const suggestions = [
		'How should I format a chorus?',
		'When should I use an em dash?',
		'How do I mark an unknown lyric?'
	];
	const quotaLow = $derived(assistant.quota !== undefined && assistant.quota.browserRemaining <= 3);
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
			composerInput?.focus();
		}}
	>
		<div class="assistant-dialog__surface">
			<header class="assistant-dialog__header">
				<div class="assistant-dialog__title">
					<Dialog.Title class="assistant-dialog__heading">Ask the rules</Dialog.Title>
					<p>LyricLint’s guidelines assistant</p>
				</div>
				<div class="assistant-dialog__commands">
					{#if assistant.chats.length > 0}
						<details
							class="assistant-chats"
							bind:open={chatsOpen}
							{@attach dismissOnOutside(dismissChats)}
						>
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
												<!-- The row stops being a way into the chat while its
												     deletion is the question: one decision on screen. -->
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
							<path
								d="M8 3v10M3 8h10"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					</button>
					<Dialog.Close class="icon-button button--quiet" aria-label="Close">
						<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
							<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" fill="none" />
						</svg>
					</Dialog.Close>
				</div>
			</header>

			<div class="assistant-transcript" aria-label="Conversation">
				{#if assistant.messages.length === 0}
					<div class="assistant-empty">
						<h3>What would you like to check?</h3>
						<p>
							Ask about Genius transcription or grammar in any reviewed language. Answers cite the
							relevant LyricLint rules.
						</p>
						<div class="assistant-suggestions" aria-label="Suggested questions">
							{#each suggestions as suggestion (suggestion)}
								<button type="button" onclick={() => void assistant.send(suggestion)}>
									<span>{suggestion}</span>
									<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
										<path
											d="M4 2.5L8 6l-4 3.5"
											fill="none"
											stroke="currentColor"
											stroke-width="1.4"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
							{/each}
						</div>
					</div>
				{:else}
					{#each assistant.messages as message, index (message.id)}
						{#if index === assistant.contextDividerIndex && index > 0}
							<p class="assistant-divider" role="separator">
								Messages above were not included as context for the latest answer.
							</p>
						{/if}
						<div class="assistant-turn" data-role={message.role}>
							<span class="sr-only">{message.role === 'user' ? 'You:' : 'Assistant:'}</span>
							{#if message.role === 'user'}
								<p class="assistant-turn__text">{message.content}</p>
							{:else if message.status === 'pending' && message.answer}
								<AssistantAnswer
									answer={message.answer}
									{previews}
									{sources}
									{referencesFailedToLoad}
								/>
								<span class="assistant-thinking" role="status" aria-label="Answering">
									<i></i><i></i><i></i>
								</span>
							{:else if message.status === 'pending'}
								<p class="assistant-turn__text" aria-busy="true">
									<span class="assistant-thinking" role="status" aria-label="Answering">
										<i></i><i></i><i></i>
									</span>
								</p>
							{:else if message.status === 'complete' && message.answer}
								<AssistantAnswer
									answer={message.answer}
									{previews}
									{sources}
									{referencesFailedToLoad}
								/>
							{:else}
								<p class="assistant-turn__text">
									{message.status === 'interrupted'
										? 'This answer was interrupted before it arrived.'
										: 'This question did not get an answer.'}
								</p>
								<button
									type="button"
									class="button"
									disabled={assistant.busy}
									onclick={() => void assistant.retry(message.id)}>Retry</button
								>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			{#if assistant.failure}
				<p class="assistant-status assistant-status--failure" role="status">
					{assistant.failure.message}
				</p>
			{:else if quotaLow && assistant.quota}
				<p class="assistant-status" role="status">
					{assistant.quota.browserRemaining} questions left today for this browser.
				</p>
			{/if}

			{#if assistant.challengePending}
				<div class="assistant-challenge">
					<div bind:this={challengeContainer}></div>
					{#if challengeFailedToRun}
						<p class="assistant-status assistant-status--failure">
							The check could not load. Reload and try again.
						</p>
					{/if}
				</div>
			{/if}

			<form class="assistant-composer" onsubmit={submit}>
				<div class="assistant-composer__field">
					<label class="sr-only" for="assistant-question">Your question</label>
					<textarea
						id="assistant-question"
						bind:this={composerInput}
						bind:value={draft}
						rows="1"
						placeholder="Ask a question about the guidelines…"
						oninput={(event) => resizeComposer(event.currentTarget)}
						onkeydown={onComposerKeydown}></textarea>
					<button
						type="submit"
						class="assistant-composer__send"
						disabled={assistant.busy || assistant.challengePending || draft.trim() === ''}
						aria-label="Ask"
					>
						<svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">
							<path
								d="M9 14V4M5 8l4-4 4 4"
								fill="none"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				</div>
			</form>
			<p class="assistant-disclosure">
				Messages are processed by OpenAI through Cloudflare. The assistant cannot see your draft.
				<a href={resolve('/(site)/privacy')}>Privacy</a>
			</p>
		</div>
	</Dialog.Content>
</Dialog.Root>
