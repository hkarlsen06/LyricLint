<script lang="ts">
	/**
	 * The /rules/ entry point: an unboxed prompt above the rule index — a
	 * sentence and a field on the canvas, no card. Submitting opens the shared
	 * modal and sends the question in one gesture.
	 */
	import { resolve } from '$app/paths';
	import { assistantAvailable } from '$lib/assistant/api.js';
	import { useAssistantState } from '$lib/assistant/assistant.svelte.js';

	const assistant = useAssistantState();
	let question = $state('');

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		const text = question;
		question = '';
		void assistant?.openWithQuestion(text);
	}
</script>

{#if assistant && assistantAvailable()}
	<form class="assistant-prompt" onsubmit={submit}>
		<label for="assistant-rules-question">Ask about transcription or wording</label>
		<div class="assistant-prompt__row">
			<input
				id="assistant-rules-question"
				type="text"
				placeholder="When does a chorus need its own header?"
				bind:value={question}
			/>
			<button type="submit" class="button" disabled={question.trim() === ''}>Ask</button>
		</div>
		<p class="assistant-prompt__hint">
			Answered by a model with the reviewed rules in hand; relevant citations render in full, while
			general proofreading needs none. Your question leaves the browser — nothing else does.
			<a href={resolve('/(site)/privacy')}>Privacy</a>
		</p>
	</form>
{/if}
