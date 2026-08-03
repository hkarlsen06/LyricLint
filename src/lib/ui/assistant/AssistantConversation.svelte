<script lang="ts">
	/**
	 * The assistant below its surface-specific header: transcript, request
	 * status, challenge, composer, and the empty-state disclosure. The modal
	 * and workbench panel share this component so a tool turn cannot acquire a
	 * second rendering or a different privacy claim on either surface.
	 */
	import { resolve } from '$app/paths';
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import {
		loadRulePreviews,
		type RulePreview,
		type RulePreviewSource
	} from '$lib/assistant/rule-previews.js';
	import { renderChallenge, type ChallengeHandle } from '$lib/assistant/turnstile.js';
	import AssistantAnswer from './AssistantAnswer.svelte';
	import AssistantLinkActionCard from './AssistantLinkActionCard.svelte';
	import AssistantProposalCard from './AssistantProposalCard.svelte';
	import AssistantToolTurn from './AssistantToolTurn.svelte';

	let { assistant }: { assistant: AssistantState } = $props();

	let composerInput = $state<HTMLTextAreaElement>();
	let challengeContainer = $state<HTMLDivElement>();
	let draft = $state('');
	let previews = $state<Map<string, RulePreview>>();
	let sources = $state<Map<string, RulePreviewSource>>();
	let referencesFailedToLoad = $state(false);
	let challengeFailedToRun = $state(false);
	let challengeHandle: ChallengeHandle | undefined;
	let revoking = $state(false);

	const suggestions = [
		'How should I format a chorus?',
		'Can you help me proofread a lyric?',
		'How do I mark an unknown lyric?'
	];
	const quotaLow = $derived(assistant.quota !== undefined && assistant.quota.browserRemaining <= 3);
	const disclosure = $derived.by(() => {
		if (!assistant.draftToolsAvailable) {
			return "Messages are processed by OpenAI through Cloudflare. The assistant cannot see your 'scribe.";
		}
		if (assistant.draftAccessState === 'granted') {
			return "Messages are processed by OpenAI through Cloudflare. This 'scribe is shared only when the assistant asks to read it.";
		}
		if (assistant.draftAccessState === 'denied') {
			return "Messages are processed by OpenAI through Cloudflare. This 'scribe is not shared.";
		}
		return "Messages are processed by OpenAI through Cloudflare. The assistant asks before reading this 'scribe.";
	});

	// The panel mounts this surface without anyone calling `open()`, so the
	// transcript asks for its own stored conversation. Idempotent under the
	// dialog, whose `open()` has already loaded it.
	$effect(() => {
		void assistant.ensureLoaded();
	});

	$effect(() => {
		let cancelled = false;
		referencesFailedToLoad = false;
		void loadRulePreviews()
			.then((loaded) => {
				if (!cancelled) {
					previews = loaded.previews;
					sources = loaded.sources;
				}
			})
			.catch(() => {
				if (!cancelled) referencesFailedToLoad = true;
			});
		return () => {
			cancelled = true;
		};
	});

	// The Turnstile widget mounts only when the backend asks for it.
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

	export function focusComposer(): void {
		composerInput?.focus();
	}

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

	function awaitingReview(messageId: string): boolean {
		return (
			assistant.toolSession?.assistantMessageId === messageId &&
			assistant.toolSession.phase !== 'continuing'
		);
	}

	// Every decision control in a tool card runs against the live session, so a
	// card belonging to a turn that no longer holds one draws a question nobody
	// can answer — which is what a transcript restored from before this session
	// used to do, Allow and Deny included. The store's own guards read exactly
	// this, so the card and the press cannot disagree about it.
	function decidable(messageId: string): boolean {
		return assistant.toolSession?.assistantMessageId === messageId;
	}

	async function revokeAccess(): Promise<void> {
		if (revoking) return;
		revoking = true;
		try {
			await assistant.revokeDraftAccess();
		} finally {
			revoking = false;
		}
	}
</script>

<div class="assistant-conversation">
	<div class="assistant-transcript" aria-label="Conversation">
		{#if assistant.messages.length === 0}
			<div class="assistant-empty">
				<h3>What would you like to check?</h3>
				<p>
					Ask about Genius transcription, proofreading, grammar, or wording. Answers cite a relevant
					reviewed rule when one applies.
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
				<div class="assistant-disclosure">
					<p>{disclosure} <a href={resolve('/(site)/privacy')}>Privacy</a></p>
					{#if assistant.draftToolsAvailable && assistant.draftAccessState}
						<button
							type="button"
							class="button button--quiet button--flush"
							disabled={revoking}
							onclick={() => void revokeAccess()}
						>
							{assistant.draftAccessState === 'granted'
								? "Stop sharing this 'scribe"
								: "Ask again before sharing this 'scribe"}
						</button>
					{/if}
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
					{:else}
						{#each message.toolTurns ?? [] as turn, turnIndex (turnIndex)}
							{#if turn.narration}
								<AssistantAnswer
									answer={turn.narration}
									{previews}
									{sources}
									{referencesFailedToLoad}
								/>
							{/if}
							{#each turn.calls as call (call.callId)}
								{#if call.name === 'read_scribe'}
									<AssistantToolTurn {call} {assistant} decidable={decidable(message.id)} />
								{:else if call.name === 'propose_edits'}
									<div class="assistant-proposals" aria-label="Proposed 'scribe edits">
										{#each call.proposals as proposal (proposal.id)}
											<AssistantProposalCard
												{proposal}
												{assistant}
												decidable={decidable(message.id)}
											/>
										{/each}
									</div>
								{:else}
									<div class="assistant-proposals" aria-label="Proposed section-link changes">
										{#each call.actions as action (action.id)}
											<AssistantLinkActionCard
												{action}
												{assistant}
												decidable={decidable(message.id)}
											/>
										{/each}
									</div>
								{/if}
							{/each}
						{/each}

						{#if message.status === 'pending' && message.answer}
							<AssistantAnswer
								answer={message.answer}
								{previews}
								{sources}
								{referencesFailedToLoad}
							/>
							{#if !awaitingReview(message.id)}
								<span class="assistant-thinking" role="status" aria-label="Answering">
									<i></i><i></i><i></i>
								</span>
							{/if}
						{:else if message.status === 'pending'}
							{#if !awaitingReview(message.id)}
								<p class="assistant-turn__text" aria-busy="true">
									<span class="assistant-thinking" role="status" aria-label="Answering">
										<i></i><i></i><i></i>
									</span>
								</p>
							{/if}
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

	<div class="assistant-conversation__foot">
		<form class="assistant-composer" onsubmit={submit}>
			<div class="assistant-composer__field">
				<label class="sr-only" for="assistant-question">Your question</label>
				<textarea
					id="assistant-question"
					bind:this={composerInput}
					bind:value={draft}
					rows="1"
					placeholder="Ask about the guidelines or proofreading…"
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
	</div>
</div>
