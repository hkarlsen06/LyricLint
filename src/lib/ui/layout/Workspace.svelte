<script lang="ts">
	import type { EditorCallbacks, EditorContext, EditorHandle } from '$lib/core/types.js';
	import type { EditorPaneProps } from '$lib/editor/index.js';
	import { onMount, type Component, untrack } from 'svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import DocumentToolbar from './DocumentToolbar.svelte';
	import MockEditorPane from './MockEditorPane.svelte';
	import RightPanel from './RightPanel.svelte';

	let {
		controller,
		editorComponent = MockEditorPane
	}: {
		controller: WorkbenchController;
		editorComponent?: Component<EditorPaneProps>;
	} = $props();

	let editorHandle = $state<EditorHandle>(untrack(() => controller.editor));
	const EditorComponent = $derived(editorComponent);
	const editorContext = $derived<EditorContext>({
		language: controller.language,
		performers: controller.performers,
		ruleSetVersion: controller.ruleSet?.version ?? 'unavailable'
	});
	const editorCallbacks: EditorCallbacks = {
		onSnapshot: (snapshot) => controller.onSnapshot(snapshot),
		onAssignRequest: () => {
			controller.setPanelCollapsed(false);
			controller.setActiveTab('performers');
		},
		onSectionHeaderRequest: () => controller.insertSection(),
		onDiagnosticActivate: (diagnostic) => controller.navigateToDiagnostic(diagnostic),
		onAnnouncement: (message) => controller.feedback.announce(message)
	};

	$effect(() => {
		controller.setEditorHandle(editorHandle);
	});

	onMount(() => {
		const narrowViewport = window.matchMedia('(max-width: 68rem)');
		if (narrowViewport.matches) controller.setPanelCollapsed(true);
		const collapseOnNarrow = (event: MediaQueryListEvent) => {
			if (event.matches) controller.setPanelCollapsed(true);
		};
		narrowViewport.addEventListener('change', collapseOnNarrow);
		return () => narrowViewport.removeEventListener('change', collapseOnNarrow);
	});
</script>

<main class:panel-collapsed={controller.panelCollapsed} class="workspace" data-testid="workspace">
	<section class="editor-region" aria-label="Lyrics workspace">
		<DocumentToolbar {controller} />
		<div class="editor-host" data-testid="editor-region">
			{#key controller.draftId}
				<EditorComponent
					initialText={controller.snapshot.text}
					initialSelection={controller.snapshot.selection}
					context={editorContext}
					callbacks={editorCallbacks}
					bind:handle={editorHandle}
				/>
			{/key}
		</div>
	</section>

	{#if controller.panelCollapsed}
		<button
			type="button"
			class="panel-reopen"
			aria-label="Show right panel"
			onclick={() => controller.setPanelCollapsed(false)}
		>
			Show panel
		</button>
	{:else}
		<RightPanel {controller} />
	{/if}
</main>
