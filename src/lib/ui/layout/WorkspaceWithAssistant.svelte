<script lang="ts">
	/**
	 * Test host: a workspace under a real assistant context.
	 *
	 * `useAssistantState` reads a module-private symbol, so the only way to hand
	 * the workspace an assistant is the door production uses —
	 * `provideAssistantState` in a parent. Tests render this instead of mocking
	 * the assistant module.
	 */
	import type { ComponentProps } from 'svelte';
	import { provideAssistantState, type AssistantState } from '$lib/assistant/assistant.svelte.js';
	import Workspace from './Workspace.svelte';

	let {
		assistant,
		...workspace
	}: { assistant: AssistantState } & ComponentProps<typeof Workspace> = $props();

	// Context is set once, at init — the initial value is the point.
	// svelte-ignore state_referenced_locally
	provideAssistantState(assistant);
</script>

<Workspace {...workspace} />
