<script lang="ts">
	import type { EditorHandle, EditorSnapshot } from '$lib/core/types.js';
	import type {
		EditorDisplayContext,
		EditorPaneProps,
		LyricEditorCallbacks
	} from '$lib/editor/index.js';
	import { assignVoiceGroup, insertSectionHeader } from '$lib/performers/index.js';
	import { getLanguagePack } from '$lib/languages/registry.js';
	import { onMount, type Component, untrack } from 'svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import {
		buildRuleContext,
		computeDiagnostics,
		resolveVoiceGroupRanges
	} from '../state/wiring.js';
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

	const reducedMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Run the rule engine for one revision and fold the diagnostics into the
	// snapshot before the controller stores it. Composition revisions reuse the
	// previous result so linting never runs on incomplete IME input.
	let lastDiagnostics: EditorSnapshot['diagnostics'] = [];

	function enrichSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
		if (!snapshot.composing) {
			const context = buildRuleContext(
				controller.language,
				controller.performers,
				controller.ruleSet?.version ?? 'unavailable'
			);
			lastDiagnostics = computeDiagnostics(snapshot.parsed, context);
		}
		return { ...snapshot, diagnostics: lastDiagnostics };
	}

	const editorContext = $derived<EditorDisplayContext>({
		language: controller.language,
		performers: controller.performers,
		ruleSetVersion: controller.ruleSet?.version ?? 'unavailable',
		parsed: controller.snapshot.parsed,
		diagnostics: {
			revision: controller.snapshot.revision,
			items: controller.snapshot.diagnostics.filter(
				(diagnostic) => !controller.ignoredRuleIds.includes(diagnostic.ruleId)
			)
		},
		voiceGroups: resolveVoiceGroupRanges(controller.snapshot.parsed, controller.performers),
		languagePack: getLanguagePack(controller.language),
		reducedMotion,
		sources: [...controller.sources.values()]
	});

	const editorCallbacks: LyricEditorCallbacks = {
		onSnapshot: (snapshot) => controller.onSnapshot(enrichSnapshot(snapshot)),
		onAssignRequest: () => {
			controller.setPanelCollapsed(false);
			controller.setActiveTab('performers');
		},
		onSectionHeaderRequest: () => {},
		onDiagnosticActivate: (diagnostic) => controller.navigateToDiagnostic(diagnostic),
		onAnnouncement: (message) => controller.feedback.announce(message),
		createPerformerEdit: ({ range, performerIds }) => {
			const snapshot = controller.snapshot;
			const result = assignVoiceGroup({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				selection: { anchor: range.from, head: range.to },
				performerIds: [...performerIds],
				roster: controller.performers
			});
			if (result.status === 'applied') return result.edit;
			const reason = (result.blocked ?? result.reason).replaceAll('-', ' ');
			controller.feedback.announce(`Performer assignment blocked: ${reason}.`);
			return undefined;
		},
		createSectionHeaderEdit: ({ range, headerName, ordinal }) => {
			const snapshot = controller.snapshot;
			const result = insertSectionHeader({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				sectionFrom: range.from,
				headerName,
				ordinal
			});
			return result.status === 'applied' ? result.edit : undefined;
		},
		onApplyDiagnosticFix: (diagnostic, fix) => controller.applyFix(diagnostic, fix),
		onIgnoreDiagnostic: (diagnostic) => controller.ignoreRule(diagnostic.ruleId)
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
