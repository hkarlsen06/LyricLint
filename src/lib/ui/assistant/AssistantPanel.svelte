<script lang="ts">
	/** The workbench pane's assistant surface. RightPanel owns the tab and pane. */
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import AssistantChatControls from './AssistantChatControls.svelte';
	import AssistantConversation from './AssistantConversation.svelte';

	let { assistant }: { assistant: AssistantState } = $props();
</script>

<div class="assistant-panel">
	<div class="assistant-panel__controls">
		<AssistantChatControls {assistant} />
	</div>
	<AssistantConversation {assistant} />
</div>

<style>
	/* The panel gives the conversation its remaining height, and is the
	 * container the conversations popover caps its width against. */
	.assistant-panel {
		display: flex;
		height: 100%;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		container-type: inline-size;
	}

	/* The panel's controls are a small command tray on the pane edge. It has no
	 * fill or border of its own, so it does not turn two glyphs into a full-width
	 * decorative band. */
	.assistant-panel__controls {
		display: flex;
		flex: none;
		justify-content: flex-end;
		padding: var(--space-1) var(--space-3) 0;
	}
</style>
