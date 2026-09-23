<script lang="ts">
	import DiagnosticActions from '$lib/diagnostics/DiagnosticActions.svelte';
	import type { Diagnostic, DiagnosticFix } from '$lib/core/types.js';

	let {
		diagnostic,
		onChooseHeader,
		onAssignPerformers,
		onLinkSections,
		onSetLanguage,
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		fixBatchSize,
		onApplyFixBatch,
		onIgnore
	}: {
		diagnostic: Diagnostic;
		onChooseHeader: () => void;
		onAssignPerformers?: () => void;
		onLinkSections?: () => void;
		onSetLanguage?: (language: string, trigger: HTMLButtonElement) => void;
		onPreviewFix: (fix: DiagnosticFix) => void;
		onCancelPreview: () => void;
		onApplyFix: (fix: DiagnosticFix) => void;
		fixBatchSize?: (fix: DiagnosticFix) => number;
		onApplyFixBatch?: (fix: DiagnosticFix) => void;
		onIgnore: (trigger: HTMLButtonElement) => void;
	} = $props();
</script>

<!-- The expanded card and the editor's popover are the same diagnostic seen from
     two places, so everything below the heading comes from the shared
     components: reasoning, then the decision. The audit trail is no longer a
     block down here. It is the citation on the head's meta line, and what this
     footer used to spell out is that link's tooltip. -->
<div class="diagnostic-details">
	<p class="diagnostic-explanation">{diagnostic.explanation}</p>

	<DiagnosticActions
		{diagnostic}
		{onChooseHeader}
		{onAssignPerformers}
		{onLinkSections}
		{onSetLanguage}
		{onPreviewFix}
		{onCancelPreview}
		{onApplyFix}
		{fixBatchSize}
		{onApplyFixBatch}
		{onIgnore}
	/>
</div>

<style>
	/* The expanded card's body (explanation and actions) is shared with the
	   editor's diagnostic popover and styled in `diagnostics.css`, as is the meta
	   line above it. What stays here is the body's own inset. */
	.diagnostic-details {
		display: grid;
		padding: 0 var(--space-4) var(--space-3);
		gap: var(--space-3);
	}

	/* Every decision in the expanded card rides above the navigate button's
	   stretched press layer (`DiagnosticList.svelte`) and takes its own press. A
	   z-index only counts on a positioned box. */
	.diagnostic-details :global(:is(button, a)) {
		position: relative;
		z-index: 1;
	}
</style>
