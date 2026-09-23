<script lang="ts">
	import { hasCompletedAnswer } from '$lib/assistant/message.js';
	/**
	 * The assistant below its surface-specific header: transcript, request
	 * status, challenge, composer, and the empty-state disclosure. The modal
	 * and workbench panel share this component so a tool turn cannot acquire a
	 * second rendering or a different privacy claim on either surface.
	 */
	import ArrowUpIcon from 'phosphor-svelte/lib/ArrowUpIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import { tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import { MAX_QUESTION_CHARS } from '$lib/assistant/types.js';
	import {
		loadRulePreviews,
		type RulePreview,
		type RulePreviewSource
	} from '$lib/assistant/rule-previews.js';
	import { renderChallenge, type ChallengeHandle } from '$lib/assistant/turnstile.js';
	import { stickToBottom } from '$lib/interaction/stick-to-bottom.js';
	import { PHONE_LAYOUT_QUERY } from '$lib/interaction/phone-layout.js';
	import LoadingMark from '$lib/ui/primitives/LoadingMark.svelte';
	import AssistantAnswer from './AssistantAnswer.svelte';
	import AssistantLinkActionCard from './AssistantLinkActionCard.svelte';
	import AssistantProposalCard from './AssistantProposalCard.svelte';
	import AssistantReferenceCard from './AssistantReferenceCard.svelte';
	import AssistantToolTurn from './AssistantToolTurn.svelte';

	let { assistant }: { assistant: AssistantState } = $props();

	let composerInput = $state<HTMLTextAreaElement>();
	const phone = new MediaQuery(PHONE_LAYOUT_QUERY);
	let challengeContainer = $state<HTMLDivElement>();
	let draft = $state('');
	const questionLength = $derived([...draft.trim()].length);
	const questionTooLong = $derived(questionLength > MAX_QUESTION_CHARS);
	let submitting = $state(false);
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
	// a question destroyed on its way to nowhere, and a tool turn parked on a
	// decision is exactly that state, live for as long as the user takes to answer
	// it. The send button knew about two of the three and the Enter key knew about
	// none, which is why the key is what people lost their question to.
	const canSend = $derived(
		!submitting &&
			!assistant.busy &&
			!assistant.challengePending &&
			assistant.toolSession === undefined
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
	 * reader watching it reads off the thinking indicator disappearing, so the
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
	// the two gestures that re-pin the follow (the first is asking a question,
	// below), and both are the user saying where they want to be looking.
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
		await sendDraft();
	}

	async function sendDraft(): Promise<void> {
		if (!canSend || questionTooLong || draft.trim() === '') return;
		const question = draft;
		submitting = true;
		resetComposer();
		try {
			// Both keyboard and button submissions restore refused input. Never
			// overwrite a newer question typed while the store checks the chat lock.
			const consumed = await ask(question);
			if (!consumed && draft.trim() === '') {
				draft = question;
				await tick();
				if (composerInput) resizeComposer(composerInput);
			}
		} finally {
			submitting = false;
		}
	}

	function resizeComposer(textarea: HTMLTextAreaElement): void {
		if (!phone.current) {
			textarea.style.height = 'auto';
			textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
			textarea.style.overflowY = textarea.scrollHeight > 144 ? 'auto' : 'hidden';
			return;
		}
		if (!textarea.clientWidth) return;
		const maximum = Number.parseFloat(getComputedStyle(textarea).maxHeight);
		textarea.style.height = 'auto';
		const height = textarea.scrollHeight;
		textarea.style.height = `${Math.min(height, maximum)}px`;
		textarea.style.overflowY = height > maximum ? 'auto' : 'hidden';
	}

	// A one-row placeholder can wrap before the first input. Re-measure when
	// a hidden Tools pane opens or rotates, as well as when its draft changes.
	$effect(() => {
		if (!phone.current) return;
		void draft;
		if (composerInput) resizeComposer(composerInput);
	});

	$effect(() => {
		if (!phone.current) return;
		const textarea = composerInput;
		if (!textarea) return;
		let width = -1;
		const observer = new ResizeObserver(([entry]) => {
			if (entry.contentRect.width === width) return;
			width = entry.contentRect.width;
			resizeComposer(textarea);
		});
		observer.observe(textarea);
		return () => observer.disconnect();
	});

	function resetComposer(): void {
		draft = '';
		if (composerInput) {
			composerInput.style.height = 'auto';
			composerInput.style.overflowY = 'hidden';
		}
	}

	function onComposerKeydown(event: KeyboardEvent): void {
		if (event.isComposing || event.key !== 'Enter' || event.shiftKey) return;
		// Enter is this field's send key whether or not the send can land, so it
		// never breaks the line; refused, it leaves the draft exactly where it is.
		event.preventDefault();
		void sendDraft();
	}

	function awaitingReview(messageId: string): boolean {
		return (
			assistant.toolSession?.assistantMessageId === messageId &&
			assistant.toolSession.phase !== 'continuing'
		);
	}

	// Every decision control in a tool card runs against the live session, so a
	// card belonging to a turn that no longer holds one draws a question nobody
	// can answer, which is what a transcript restored from before this session
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
							<CaretRightIcon aria-hidden="true" size={11} weight="bold" />
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
					     presentational, so the sentence, which is the whole of what this
					     divider says, and it is about what was sent, is pruned from the
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
								     it froze under `prefers-reduced-motion`, where a still mark
								     reads as a drawing rather than as anything happening. -->
								<LoadingMark label="Answering" />
							{/if}
						{:else if message.status === 'pending'}
							{#if !awaitingReview(message.id)}
								<p class="assistant-turn__text" aria-busy="true">
									<LoadingMark label="Answering" />
								</p>
							{/if}
						{:else if hasCompletedAnswer(message)}
							{#if message.answer}
								<AssistantAnswer
									answer={message.answer}
									{previews}
									{sources}
									{referencesFailedToLoad}
								/>
							{:else}
								<p class="assistant-turn__text">{message.content}</p>
							{/if}
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
			<p
				id="assistant-question-limit"
				class="assistant-composer__limit"
				class:danger-text={questionTooLong}
				aria-live="polite"
			>
				{#if questionTooLong}
					Remove {questionLength - MAX_QUESTION_CHARS}
					{questionLength - MAX_QUESTION_CHARS === 1 ? 'character' : 'characters'} to send.
				{:else}
					{MAX_QUESTION_CHARS.toLocaleString('en')} characters maximum<span
						class="assistant-composer__keyboard-hint"
					>
						· Shift+Enter for a new line</span
					>
				{/if}
			</p>
			<div class="assistant-composer__field">
				<label class="sr-only" for="assistant-question">Your question</label>
				<textarea
					id="assistant-question"
					bind:this={composerInput}
					bind:value={draft}
					rows="1"
					placeholder="Ask about the guidelines or proofreading…"
					aria-describedby="assistant-question-limit"
					aria-invalid={questionTooLong}
					oninput={(event) => resizeComposer(event.currentTarget)}
					onkeydown={onComposerKeydown}></textarea>
				<!-- The shared tiers, not a fourth one: this is the composer's one
				     destination action, so it is `.icon-button` in the contrast tier and
				     takes that tier's disabled treatment with it. The class beside them
				     is sizing only. -->
				<button
					type="submit"
					class="icon-button button--contrast assistant-composer__send"
					disabled={!canSend || questionTooLong || draft.trim() === ''}
					aria-label="Ask"
				>
					<ArrowUpIcon aria-hidden="true" size={17} weight="bold" />
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	/*
	 * The transcript reads as a conversation, not a log: the user's words are a
	 * compact filled bubble on the right (the one familiar mark every chat reader
	 * already knows), and the assistant answers as plain prose on the surface, so
	 * neither turn needs a "You"/"Assistant" caption or a hairline to say whose it
	 * is. Those captions stay in the accessible tree (`sr-only`), because position
	 * and fill reach nobody who cannot see them. The whole run sits in one centered
	 * reading column, and a cited rule is one quiet meta line in the diagnostics
	 * idiom rather than a labelled attachment block.
	 */

	/* Both hosts give the conversation their remaining height. The transcript is
	 * the only scrolling region; the composer stays at the foot while the privacy
	 * disclosure belongs to the empty state above it. */
	.assistant-conversation {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
	}

	.assistant-conversation__foot {
		flex: none;
		margin-top: auto;
	}

	/* The transcript is one centered reading column; spacing separates the turns,
	 * so no hairlines between them. */
	.assistant-transcript {
		overflow-y: auto;
		flex: 1;
		min-height: 14rem;
		padding: var(--space-5);
	}

	.assistant-transcript > * {
		width: 100%;
		max-width: 40rem;
		margin-inline: auto;
	}

	.assistant-turn {
		padding-block: var(--space-3);
	}

	.assistant-turn[data-role='user'] {
		display: flex;
		justify-content: flex-end;
	}

	.assistant-turn[data-role='user'] .assistant-turn__text {
		max-width: min(85%, 32rem);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-lg);
		background: var(--color-fill-subtle);
	}

	.assistant-turn__text {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.assistant-turn .button {
		margin-block-start: var(--space-2);
	}

	/* Proposals repeat as independently reviewable units, so each earns a
	 * softly raised surface (the cards themselves, in `assistant.css`). */
	.assistant-proposals {
		display: grid;
		gap: var(--space-2);
		margin-block: var(--space-2) var(--space-3);
	}

	/* The empty state is prose on the surface: a question, one sentence, the
	 * suggestions as quiet rows, then the privacy boundary while the reader is
	 * deciding whether to begin. */
	.assistant-empty {
		display: flex;
		height: 100%;
		min-height: 20rem;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		text-align: center;
		color: var(--color-text-muted);
	}

	.assistant-empty h3 {
		margin: 0 0 var(--space-2);
		color: var(--color-text);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-medium);
	}

	.assistant-empty > p {
		max-width: 28rem;
		margin: 0;
		font-size: var(--font-size-sm);
	}

	.assistant-suggestions {
		display: grid;
		width: min(100%, 24rem);
		gap: var(--space-0-5);
		margin-block-start: var(--space-5);
	}

	.assistant-suggestions button {
		display: flex;
		min-height: var(--control-height-md);
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-1-5) var(--space-3);
		border: 0;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--color-text);
		font: inherit;
		font-size: var(--font-size-sm);
		text-align: start;
		cursor: pointer;
	}

	.assistant-suggestions button :global(svg) {
		flex: none;
		color: var(--color-text-muted);
	}

	.assistant-suggestions button:hover {
		background: var(--color-control-hover);
	}

	.assistant-divider {
		margin-block: var(--space-3);
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		text-align: center;
	}

	.assistant-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-5);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.assistant-status--failure {
		color: var(--color-text);
	}

	.assistant-challenge {
		padding: var(--space-2) var(--space-5);
	}

	/* The composer's foot is its own gutter, so the field sits in an even inset
	 * rather than pressed against the bottom edge. It is one custom property
	 * because the dialog and the panel gutter differently and the two edges must
	 * not be able to disagree. */
	.assistant-composer {
		--composer-gutter: var(--space-5);

		display: grid;
		padding: var(--space-2) var(--composer-gutter) var(--composer-gutter);
		gap: var(--space-1);
	}

	.assistant-composer__field {
		display: flex;
		align-items: center;
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
		border-radius: var(--radius-control);
		background: var(--color-surface);
		box-shadow: var(--shadow-control);
	}

	.assistant-composer__limit {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
	}

	.assistant-composer__limit.danger-text {
		color: var(--color-danger);
	}

	.assistant-composer textarea {
		flex: 1;
		height: auto;
		min-height: 2.5rem;
		max-height: 9rem;
		padding: var(--space-2) 0;
		border: 0;
		outline: 0;
		background: transparent;
		box-shadow: none;
		color: var(--color-text);
		font: inherit;
		resize: none;
		overflow-y: hidden;
	}

	/* Desktop keeps the shared field hover (`controls.css`). It outranked the
	 * transparent fill above while this rule was global; scoping lifts this rule
	 * to a tie, so the hover is stated here rather than left to load order. */
	.assistant-composer textarea:hover:not(:disabled) {
		background: var(--color-control-hover);
	}

	.assistant-composer__field:focus-within {
		border-color: var(--color-focus);
		box-shadow: 0 0 0 var(--focus-ring-width) var(--color-focus-soft);
	}

	/* Sizing only. Everything the control *is* (the silhouette, the contrast
	   tier's inversion, and the muted-surface disabled state) comes from
	   `controls.css`, so this cannot drift into a fourth tier again. */
	.assistant-composer__send {
		flex: none;
		width: var(--control-height-lg);
		height: var(--control-height-lg);
	}

	@media (pointer: coarse) and (max-width: 68rem) {
		.assistant-composer textarea {
			appearance: none;
			min-width: 0;
			border-radius: 0;
			font-size: var(--font-size-editor);
			min-height: var(--control-height-touch);
		}

		/* The enclosing field owns the surface, including on sticky touch hover. */
		.assistant-composer textarea:hover:not(:disabled) {
			background: transparent;
		}

		.assistant-composer__send {
			width: var(--control-height-touch);
			height: var(--control-height-touch);
		}

		.assistant-composer__keyboard-hint {
			display: none;
		}
	}

	/* The workbench's coarse-pointer field floor (`.workspace textarea` in
	 * `responsive.css`) outranked this composer's own sizing while these rules
	 * were global. Scoping reverses that, so the floor is restated here. */
	@media (pointer: coarse) {
		:global(.workspace) .assistant-composer textarea {
			font-size: var(--font-size-lg);
			min-height: var(--control-height-touch);
		}
	}

	.assistant-disclosure {
		max-width: 30rem;
		padding: 0;
		margin-block-start: var(--space-5);
		color: var(--color-text-muted);
		font-size: var(--font-size-2xs);
		text-align: center;
	}

	.assistant-disclosure p {
		margin: 0;
	}

	.assistant-disclosure .button {
		min-height: var(--control-height-sm);
		margin-block-start: var(--space-1);
		font-size: var(--font-size-xs);
	}

	/* The shared touch and narrow-width control floors (`:root .button` in
	 * `responsive-shared.css`, `.workspace .button` in `responsive.css`)
	 * outranked the compact height above while it was global. Scoping reverses
	 * that, so the floors are restated here in their original order. */
	@media (max-width: 46rem) {
		.assistant-disclosure .button {
			min-height: var(--control-height-lg);
		}
	}

	@media (pointer: coarse) {
		.assistant-disclosure .button {
			min-height: var(--control-height-touch);
		}
	}

	:global(.assistant-panel) .assistant-transcript {
		min-height: 0;
		padding: var(--space-3);
	}

	:global(.assistant-panel) .assistant-empty {
		min-height: 14rem;
	}

	:global(.assistant-panel) .assistant-status,
	:global(.assistant-panel) .assistant-challenge {
		padding-inline: var(--space-3);
	}

	:global(.assistant-panel) .assistant-composer {
		--composer-gutter: var(--space-3);
		/* Match the media strip's bottom padding. */
		padding-bottom: var(--space-2-5);
	}

	@media (max-width: 36rem) {
		.assistant-transcript,
		.assistant-status,
		.assistant-challenge {
			padding-inline: var(--space-3);
		}

		.assistant-composer {
			--composer-gutter: var(--space-3);
		}

		.assistant-disclosure {
			padding-inline: var(--space-3);
		}
	}
</style>
