<script lang="ts">
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import type { AssistantToolCallRecord } from '$lib/persistence/types.js';

	type DraftReadCall = Extract<AssistantToolCallRecord, { name: 'read_scribe' }>;

	let {
		call,
		assistant,
		decidable
	}: {
		call: DraftReadCall;
		assistant: AssistantState;
		/**
		 * Whether this turn still holds the live tool session. An unanswered
		 * call outlives the session that asked it — the record persists, the
		 * session does not — and `allowDraftRead` refuses without one, so a
		 * prompt drawn on `call.outcome` alone is two dead buttons above a line
		 * saying the answer was interrupted. Undecided and no longer decidable
		 * is a third state, and it is history rather than a question.
		 */
		decidable: boolean;
	} = $props();

	let resolving = $state(false);

	async function decide(decision: 'allow' | 'deny'): Promise<void> {
		if (resolving || call.outcome) return;
		resolving = true;
		try {
			if (decision === 'allow') await assistant.allowDraftRead();
			else await assistant.denyDraftRead();
		} finally {
			resolving = false;
		}
	}
</script>

{#snippet receipt(text: string)}
	<p class="assistant-tool-turn__receipt">
		<svg
			viewBox="0 0 14 14"
			width="12"
			height="12"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			stroke-width="1.3"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M3.5 1.5h4.2L11 4.8v7.7H3.5z" />
			<path d="M7.5 1.7v3.3h3.3" />
			<path d="M5.4 8h3.2M5.4 10.2h2.2" />
		</svg>
		<span>{text}</span>
	</p>
{/snippet}

<div class="assistant-tool-turn">
	{#if call.outcome === 'granted'}
		{@render receipt("'Scribe shared.")}
	{:else if call.outcome === 'denied'}
		{@render receipt("'Scribe not shared.")}
	{:else if !decidable}
		<!-- The question outlived the session that could answer it, so it is
		     stated as what happened rather than redrawn as a prompt. -->
		{@render receipt("The assistant asked to read this 'scribe.")}
	{:else}
		<p>The assistant would like to read this 'scribe to answer your question.</p>
		<div class="assistant-tool-turn__actions">
			<button
				type="button"
				class="button button--contrast"
				disabled={resolving}
				onclick={() => void decide('allow')}>Allow</button
			>
			<button
				type="button"
				class="button button--quiet"
				disabled={resolving}
				onclick={() => void decide('deny')}>Deny</button
			>
		</div>
		<span class="sr-only" role="status" aria-live="polite">
			{resolving
				? "Saving your 'scribe sharing decision."
				: "Waiting for your 'scribe sharing decision."}
		</span>
	{/if}
</div>
