<script lang="ts">
	/**
	 * The assistant's entry point on the reference sections, contracted to the
	 * glyph the workbench's tab strip already taught: one sparkles button beside
	 * the search field, opening the shared modal. This replaced a full prompt —
	 * a label, a field, a button and three lines of hint — which stood over both
	 * index columns saying more about the assistant than the columns said about
	 * their own content. The accessible name is the whole label, the glyph is
	 * `aria-hidden`, and the button draws only in builds that actually have an
	 * assistant endpoint behind it.
	 */
	import { WandSparkles } from 'lucide-svelte';
	import { assistantAvailable } from '$lib/assistant/api.js';
	import { useAssistantState } from '$lib/assistant/assistant.svelte.js';

	const assistant = useAssistantState();
</script>

{#if assistant && assistantAvailable()}
	<button
		type="button"
		class="button button--quiet site-finder__assistant"
		aria-label="Ask the assistant"
		title="Ask the assistant"
		onclick={() => void assistant.open()}
	>
		<WandSparkles aria-hidden="true" size={18} strokeWidth={2} />
	</button>
{/if}
