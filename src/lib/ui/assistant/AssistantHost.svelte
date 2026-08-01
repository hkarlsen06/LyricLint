<script lang="ts">
	/**
	 * The one assistant surface: the modal, rendered wherever the layout put it.
	 * The state itself is created and provided by the root layout — context only
	 * reaches descendants, and both entry points are pages, not siblings of
	 * this component. Draws nothing in a build with no assistant endpoint.
	 */
	import { assistantAvailable } from '$lib/assistant/api.js';
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import AssistantDialog from './AssistantDialog.svelte';

	let { assistant }: { assistant: AssistantState } = $props();
</script>

{#if assistantAvailable()}
	<AssistantDialog {assistant} />
{/if}
