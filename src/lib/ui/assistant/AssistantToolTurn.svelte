<script lang="ts">
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import type { AssistantToolCallRecord } from '$lib/persistence/types.js';

	type DraftReadCall = Extract<AssistantToolCallRecord, { name: 'read_scribe' }>;

	let { call, assistant }: { call: DraftReadCall; assistant: AssistantState } = $props();

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

<div class="assistant-tool-turn">
	{#if call.outcome === 'granted'}
		<p>Draft shared.</p>
	{:else if call.outcome === 'denied'}
		<p>Draft not shared.</p>
	{:else}
		<p>The assistant would like to read this draft to answer your question.</p>
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
				? 'Saving your draft sharing decision.'
				: 'Waiting for your draft sharing decision.'}
		</span>
	{/if}
</div>
