<script lang="ts">
	/**
	 * The conversation modal. Bits UI owns focus trapping, Escape/outside-press
	 * dismissal, and focus restoration. Closing never cancels a request — request
	 * state lives in the root-level store.
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

	const activeChatTitle = $derived(
		assistant.chats.find((chat) => chat.id === assistant.activeChatId)?.title
	);
	const quotaLow = $derived(assistant.quota !== undefined && assistant.quota.browserRemaining <= 3);
	const suggestions = [
		'How should I format a chorus?',
		'When should I use an em dash?',
		'How do I mark an unknown lyric?'
	];
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
			<div class="assistant-dialog__header">
				<div class="assistant-dialog__title">
					<span class="assistant-dialog__mark" aria-hidden="true">
						<svg viewBox="0 0 20 20" width="18" height="18">
							<path
								d="M4.25 3.5h11.5v9H9l-3.75 3v-3h-1z"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linejoin="round"
							/>
							<path
								d="M7 7h6M7 9.75h4"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
					</span>
					<div>
						<Dialog.Title class="assistant-dialog__heading">Ask the rules</Dialog.Title>
						<p>LyricLint’s guidelines assistant</p>
					</div>
				</div>
				<div class="assistant-dialog__chats">
					{#if assistant.chats.length > 0}
						<label class="sr-only" for="assistant-chat-select">Conversation</label>
						<select
							id="assistant-chat-select"
							class="assistant-dialog__select"
							value={assistant.activeChatId ?? ''}
							disabled={assistant.busy || assistant.challengePending}
							onchange={(event) => {
								const id = event.currentTarget.value;
								if (id) void assistant.selectChat(id);
							}}
						>
							{#if !assistant.activeChatId}
								<option value="">New chat</option>
							{/if}
							{#each assistant.chats as chat (chat.id)}
								<option value={chat.id}>{chat.title}</option>
							{/each}
						</select>
						{#if assistant.activeChatId}
							<button
								type="button"
								class="button button--quiet"
								disabled={assistant.busy || assistant.challengePending}
								onclick={() => {
									const id = assistant.activeChatId;
									if (id) void assistant.deleteChat(id);
								}}
								aria-label={`Delete chat ${activeChatTitle ?? ''}`}>Delete</button
							>
						{/if}
					{/if}
					<button
						type="button"
						class="button assistant-dialog__new"
						disabled={assistant.busy || assistant.challengePending}
						onclick={() => void assistant.newChat()}
					>
						<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
							<path
								d="M8 3v10M3 8h10"
								stroke="currentColor"
								stroke-width="1.5"
								stroke-linecap="round"
							/>
						</svg>
						<span>New chat</span>
					</button>
					<Dialog.Close class="icon-button button--quiet" aria-label="Close">
						<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
							<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" fill="none" />
						</svg>
					</Dialog.Close>
				</div>
			</div>

			<div class="assistant-transcript" aria-label="Conversation">
				{#if assistant.messages.length === 0}
					<div class="assistant-empty">
						<span class="assistant-empty__mark" aria-hidden="true">
							<svg viewBox="0 0 24 24" width="24" height="24">
								<path
									d="M5 4.5h14v11H11l-4.5 4v-4H5z"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linejoin="round"
								/>
								<path
									d="M8.5 9h7M8.5 12h4.5"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
								/>
							</svg>
						</span>
						<h3>What would you like to check?</h3>
						<p>
							Ask about Genius transcription or grammar in any reviewed language. Answers cite the
							relevant LyricLint rules.
						</p>
						<div class="assistant-suggestions" aria-label="Suggested questions">
							{#each suggestions as suggestion (suggestion)}
								<button type="button" onclick={() => void assistant.send(suggestion)}
									>{suggestion}</button
								>
							{/each}
						</div>
						<p class="assistant-empty__privacy">
							The assistant never sees your draft—only what you send here.
						</p>
					</div>
				{:else}
					{#each assistant.messages as message, index (message.id)}
						{#if index === assistant.contextDividerIndex && index > 0}
							<p class="assistant-divider" role="separator">
								Messages above were not included as context for the latest answer.
							</p>
						{/if}
						<div class="assistant-turn" data-role={message.role}>
							{#if message.role === 'user'}
								<p class="assistant-turn__meta">You</p>
								<p class="assistant-turn__text">{message.content}</p>
							{:else if message.status === 'pending' && message.answer}
								<p class="assistant-turn__meta">Assistant</p>
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
								<p class="assistant-turn__meta">Assistant</p>
								<p class="assistant-turn__text" aria-busy="true">
									<span class="assistant-thinking" role="status" aria-label="Answering">
										<i></i><i></i><i></i>
									</span>
								</p>
							{:else if message.status === 'complete' && message.answer}
								<p class="assistant-turn__meta">Assistant</p>
								<AssistantAnswer
									answer={message.answer}
									{previews}
									{sources}
									{referencesFailedToLoad}
								/>
							{:else}
								<p class="assistant-turn__meta">Assistant</p>
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
