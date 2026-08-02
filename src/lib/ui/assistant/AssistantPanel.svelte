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
