<script lang="ts">
	import type { Severity } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import DiagnosticList from './DiagnosticList.svelte';

	let { controller }: { controller: WorkbenchController } = $props();

	const filters: Array<{ value: Severity; label: string }> = [
		{ value: 'error', label: 'Errors' },
		{ value: 'warning', label: 'Warnings' },
		{ value: 'suggestion', label: 'Suggestions' },
		{ value: 'manual-review', label: 'Manual review' }
	];

	let filtersOpen = $state(false);
	const filtered = $derived(controller.severityFilter.length < filters.length);

	const counts = $derived.by(() => {
		const result: Record<Severity, number> = {
			error: 0,
			warning: 0,
			suggestion: 0,
			'manual-review': 0
		};
		for (const diagnostic of controller.snapshot.diagnostics) {
			if (!controller.ignoredRuleIds.includes(diagnostic.ruleId)) result[diagnostic.severity] += 1;
		}
		return result;
	});

	// Only blame the filters when they are actually what is hiding something;
	// an otherwise clean draft should read as clean.
	const emptyMessage = $derived.by(() => {
		// An untouched draft is not "clean" — it has nothing to lint yet, so the
		// panel points at the two things that get linting started.
		if (controller.snapshot.text.trim().length === 0) {
			return 'Paste or write some lyrics to get started, and make sure the selected language is correct.';
		}
		const unignored = controller.snapshot.diagnostics.filter(
			(diagnostic) => !controller.ignoredRuleIds.includes(diagnostic.ruleId)
		);
		if (unignored.some((diagnostic) => !controller.severityFilter.includes(diagnostic.severity))) {
			return 'No diagnostics match the current filters.';
		}
		if (controller.snapshot.diagnostics.length > 0) {
			return 'Every issue in this draft comes from a rule you ignored.';
		}
		return 'No issues found.';
	});

	function lineFor(offset: number): number {
		const text = controller.snapshot.text;
		let line = 1;
		for (let index = 0; index < offset && index < text.length; index += 1) {
			if (text[index] === '\n') line += 1;
		}
		return line;
	}
</script>

<div class="panel-content linter-panel">
	<div class="linter-panel__filter-row">
		<button
			type="button"
			class="linter-panel__filter-toggle"
			class:is-filtered={filtered}
			aria-expanded={filtersOpen}
			onclick={() => (filtersOpen = !filtersOpen)}
		>
			Filter{filtered ? ' · on' : ''}
		</button>
	</div>
	{#if filtersOpen}
		<div class="linter-panel__filters" role="group" aria-label="Filter diagnostics by severity">
			{#each filters as filter (filter.value)}
				<button
					type="button"
					class="linter-panel__filter-chip linter-panel__filter-chip--{filter.value}"
					class:is-empty={counts[filter.value] === 0}
					aria-pressed={controller.severityFilter.includes(filter.value)}
					onclick={() => controller.toggleSeverity(filter.value)}
				>
					{filter.label}
					<span class="linter-panel__filter-count">{counts[filter.value]}</span>
				</button>
			{/each}
		</div>
	{/if}

	<DiagnosticList
		diagnostics={controller.visibleDiagnostics}
		sources={controller.sources}
		activeDiagnosticKey={controller.activeDiagnosticKey}
		{emptyMessage}
		{lineFor}
		onNavigate={(diagnostic) => controller.navigateToDiagnostic(diagnostic)}
		onChooseHeader={(diagnostic) => controller.chooseSectionHeader(diagnostic)}
		onAssignPerformers={(diagnostic) => controller.assignDiagnosticPerformers(diagnostic)}
		onPreviewFix={(diagnostic, fix) => controller.previewFix(diagnostic, fix)}
		onCancelPreview={() => controller.clearFixPreview()}
		onApplyFix={(diagnostic, fix) => controller.applyFix(diagnostic, fix)}
		onIgnore={(ruleId) => controller.ignoreRule(ruleId)}
	/>
</div>
