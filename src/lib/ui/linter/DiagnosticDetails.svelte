<script lang="ts">
	import DiagnosticActions from '$lib/diagnostics/DiagnosticActions.svelte';
	import DiagnosticSources from '$lib/diagnostics/DiagnosticSources.svelte';
	import type { Diagnostic, DiagnosticFix, SourceReference } from '$lib/core/types.js';

	let {
		diagnostic,
		sources,
		onChooseHeader,
		onAssignPerformers,
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		onIgnore
	}: {
		diagnostic: Diagnostic;
		sources: ReadonlyMap<string, SourceReference>;
		onChooseHeader: () => void;
		onAssignPerformers?: () => void;
		onPreviewFix: (fix: DiagnosticFix) => void;
		onCancelPreview: () => void;
		onApplyFix: (fix: DiagnosticFix) => void;
		onIgnore: (trigger: HTMLButtonElement) => void;
	} = $props();
</script>

<!-- The expanded card and the editor's popover are the same diagnostic seen from
     two places, so everything below the heading comes from the shared
     components: reasoning, the decision, then the audit trail. -->
<div class="diagnostic-details">
	<p class="diagnostic-explanation">{diagnostic.explanation}</p>

	<DiagnosticActions
		{diagnostic}
		{onChooseHeader}
		{onAssignPerformers}
		{onPreviewFix}
		{onCancelPreview}
		{onApplyFix}
		{onIgnore}
	/>

	<DiagnosticSources sourceIds={diagnostic.sourceIds} {sources} />
</div>
