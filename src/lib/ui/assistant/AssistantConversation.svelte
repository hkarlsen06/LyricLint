<script lang="ts">
	/**
	 * The assistant below its surface-specific header: transcript, request
	 * status, challenge, composer, and the empty-state disclosure. The modal
	 * and workbench panel share this component so a tool turn cannot acquire a
	 * second rendering or a different privacy claim on either surface.
	 */
	import { ArrowUp, ChevronRight } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import {
		loadRulePreviews,
		type RulePreview,
		type RulePreviewSource
	} from '$lib/assistant/rule-previews.js';
	import { renderChallenge, type ChallengeHandle } from '$lib/assistant/turnstile.js';
	import { stickToBottom } from '$lib/interaction/stick-to-bottom.js';
	import LoadingMark from '$lib/ui/primitives/LoadingMark.svelte';
	import AssistantAnswer from './AssistantAnswer.svelte';
	import AssistantLinkActionCard from './AssistantLinkActionCard.svelte';
	import AssistantProposalCard from './AssistantProposalCard.svelte';
	import AssistantReferenceCard from './AssistantReferenceCard.svelte';
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
	const transcript = stickToBottom();

	const suggestions = [
		'How should I format a chorus?',
		'Can you help me proofread a lyric?',
		'How do I mark an unknown lyric?'
	];
	const quotaLow = $derived(assistant.quota !== undefined && assistant.quota.browserRemaining <= 3);
	// The whole of what `send()` refuses on, read in one place. Both submit paths
	// clear the composer before asking, so a state the store silently declines is
	// a question destroyed on its way to nowhere — and a tool turn parked on a
	// decision is exactly that state, live for as long as the user takes to answer
	// it. The send button knew about two of the three and the Enter key knew about
	// none, which is why the key is what people lost their question to.
	const canSend = $derived(
		!assistant.busy && !assistant.challengePending && assistant.toolSession === undefined
	);
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

	/*
	 * One channel per event, so nothing is said twice.
	 *
	 * The transcript is a `log`, and it carries its own additions: a turn
	 * arriving, an answer filling in. What it cannot state is the *transition* a
	 * reader watching it reads off the thinking indicator disappearing — so the
	 * moment a pending answer completed is said here, and so is a request that
	 * failed and a quota running low, which are the two sentences below the
	 * transcript rather than in it. Nothing that this region speaks is spoken by
	 * the log, and the paragraphs it stands in for carry no role of their own.
	 *
	 * It is mounted empty and filled, never inserted already carrying its text:
	 * an element born with content is an addition to the accessibility tree
	 * rather than a change inside a live region, and most screen readers announce
	 * only the change.
	 */
	let announcement = $state('');
	let answerStatus: string | undefined;

	$effect(() => {
		const last = assistant.messages.at(-1);
		const status = last?.role === 'assistant' ? last.status : undefined;
		// The flip, never the state: a transcript restored with a complete answer
		// in it has not just answered anything.
		if (answerStatus === 'pending' && status === 'complete') announcement = 'Answer ready';
		answerStatus = status;
	});

	$effect(() => {
		if (assistant.failure) announcement = assistant.failure.message;
	});

	$effect(() => {
		if (quotaLow && assistant.quota) {
			announcement = `${assistant.quota.browserRemaining} questions left today for this browser.`;
		}
	});

	// The panel mounts this surface without anyone calling `open()`, so the
	// transcript asks for its own stored conversation. Idempotent under the
	// dialog, whose `open()` has already loaded it.
	$effect(() => {
		void assistant.ensureLoaded();
	});

	// Another conversation is another transcript, and one is read from its foot:
	// the last thing said in it is where it was left off. This is the second of
	// the two gestures that re-pin the follow — the first is asking a question,
	// below — and both are the user saying where they want to be looking.
	$effect(() => {
		void assistant.activeChatId;
		transcript.pin();
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

	// Every way of asking goes through here, so the follow cannot be re-pinned by
	// one of them and not another: asking a question is a request to see the
	// answer to it, whichever control was pressed.
	function ask(question: string): Promise<boolean> {
		transcript.pin();
		return assistant.send(question);
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!canSend || draft.trim() === '') return;
		const question = draft;
		resetComposer();
		const consumed = await ask(question);
		// A refusal only discoverable past the await — the conversation held by
		// another tab — hands the question back, the same rule the synchronous
		// busy guard keeps by never clearing at all. Only into a composer still
		// empty: the reader may have typed on while the probe was out.
		if (!consumed && draft.trim() === '') draft = question;
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
		if (event.key !== 'Enter' || event.shiftKey) return;
		// Enter is this field's send key whether or not the send can land, so it
		// never breaks the line; refused, it leaves the draft exactly where it is.
		event.preventDefault();
		if (!canSend || draft.trim() === '') return;
		const question = draft;
		resetComposer();
		void ask(question);
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
	<!-- `log`, which is what a transcript is: additions in order, announced
	     politely, and the role that makes the label a name rather than a string
	     on a generic box nothing reads. -->
	<div
		class="assistant-transcript"
		role="log"
		aria-label="Conversation"
		{@attach transcript.attach}
	>
		{#if assistant.messages.length === 0}
			<div class="assistant-empty">
				<h3>What would you like to check?</h3>
				<p>
					Ask about Genius transcription, proofreading, grammar, or wording. Answers cite a relevant
					reviewed rule when one applies.
				</p>
				<div class="assistant-suggestions" role="group" aria-label="Suggested questions">
					{#each suggestions as suggestion (suggestion)}
						<button type="button" onclick={() => void ask(suggestion)}>
							<span>{suggestion}</span>
							<ChevronRight aria-hidden="true" size={11} strokeWidth={2.8} />
						</button>
					{/each}
				</div>
				<div class="assistant-disclosure">
					<!-- The appended slash is load-bearing, exactly as it is on the rule
					     index's rows: `resolve` interpolates the route pattern and knows
					     nothing about `trailingSlash: 'always'`, so the bare result is a
					     URL every visit redirects away from. -->
					<p>{disclosure} <a href="{resolve('/(site)/privacy')}/">Privacy</a></p>
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
					<!-- No `role="separator"`: a non-focusable separator's children are
					     presentational, so the sentence — which is the whole of what this
					     divider says, and it is about what was sent — is pruned from the
					     accessibility tree. A styled paragraph is the honest element. -->
					<p class="assistant-divider">
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
									<div class="assistant-proposals" role="group" aria-label="Proposed 'scribe edits">
										{#each call.proposals as proposal (proposal.id)}
											<AssistantProposalCard
												{proposal}
												{assistant}
												decidable={decidable(message.id)}
											/>
										{/each}
									</div>
								{:else if call.name === 'show_lyrics'}
									<div class="assistant-proposals" role="group" aria-label="Referenced lyrics">
										{#each call.references as reference (reference.id)}
											<AssistantReferenceCard {reference} {assistant} />
										{/each}
									</div>
								{:else}
									<div
										class="assistant-proposals"
										role="group"
										aria-label="Proposed section-link changes"
									>
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
								<!-- The application's one answer to a wait with no measurable end.
								     A second indicator here was a second timing scale as well, and
								     it froze under `prefers-reduced-motion` — where a still mark
								     reads as a drawing rather than as anything happening. -->
								<LoadingMark label="Answering" />
							{/if}
						{:else if message.status === 'pending'}
							{#if !awaitingReview(message.id)}
								<p class="assistant-turn__text" aria-busy="true">
									<LoadingMark label="Answering" />
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
								onclick={() => {
									transcript.pin();
									void assistant.retry(message.id);
								}}>Retry</button
							>
						{/if}
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	<!-- Both are drawn only, and neither is a live region: they are inserted
	     already carrying their text, which is an addition to the accessibility
	     tree rather than a change inside one. The sr-only region at the foot is
	     the channel that speaks them. -->
	{#if assistant.failure}
		<p class="assistant-status assistant-status--failure">
			{assistant.failure.message}
		</p>
	{:else if quotaLow && assistant.quota}
		<p class="assistant-status">
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
		<p class="sr-only" role="status" data-testid="assistant-announcement">{announcement}</p>
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
				<!-- The shared tiers, not a fourth one: this is the composer's one
				     destination action, so it is `.icon-button` in the contrast tier and
				     takes that tier's disabled treatment with it. The class beside them
				     is sizing only. -->
				<button
					type="submit"
					class="icon-button button--contrast assistant-composer__send"
					disabled={!canSend || draft.trim() === ''}
					aria-label="Ask"
				>
					<ArrowUp aria-hidden="true" size={17} strokeWidth={2.25} />
				</button>
			</div>
		</form>
	</div>
</div>
