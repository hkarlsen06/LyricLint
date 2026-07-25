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

	// Diagnostics the severity chips are currently hiding. Ignored rules do not
	// count: the filters only take the blame for what they actually hide.
	const hiddenByFilters = $derived(
		controller.snapshot.diagnostics.filter(
			(diagnostic) =>
				!controller.ignoredRuleIds.includes(diagnostic.ruleId) &&
				!controller.severityFilter.includes(diagnostic.severity)
		).length
	);

	// Only blame the filters when they are actually what is hiding something;
	// an otherwise clean draft should read as clean.
	const emptyState = $derived.by(() => {
		// An untouched draft is not "clean" — it has nothing to lint yet, so the
		// panel points at the two things that get linting started.
		if (controller.snapshot.text.trim().length === 0) {
			return {
				title: 'Nothing to lint yet',
				detail:
					'Paste or write some lyrics to get started, and make sure the selected language is correct.'
			};
		}
		if (hiddenByFilters > 0) {
			return {
				title: 'Hidden by filters',
				detail: `${hiddenByFilters} ${hiddenByFilters === 1 ? 'issue is' : 'issues are'} hidden by the severity filters. Re-enable a severity to see ${hiddenByFilters === 1 ? 'it' : 'them'}.`
			};
		}
		if (controller.snapshot.diagnostics.length > 0) {
			return {
				title: 'All issues ignored',
				detail:
					'Every issue in this draft comes from a rule you ignored. Restore rules from Ignored rules below.'
			};
		}
		return {
			title: 'No issues found',
			detail: 'This draft passes every enabled rule. Diagnostics reappear as you edit.'
		};
	});

	// The list ends on purpose, not because the panel ran out of surface: the
	// line after the last card says whether anything else is out of sight.
	const afterword = $derived(
		hiddenByFilters > 0
			? `${hiddenByFilters} more ${hiddenByFilters === 1 ? 'issue' : 'issues'} hidden by the severity filters.`
			: 'No further issues.'
	);

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
	<!-- The chips have no trigger of their own: the Linter tab, pressed again
	     while already inside the linter, is what reveals and hides them. -->
	{#if controller.severityFiltersOpen}
		<div class="linter-panel__filters" role="group" aria-label="Filter diagnostics by severity">
			{#each filters as filter (filter.value)}
				<button
					type="button"
					class="linter-panel__filter-chip linter-panel__filter-chip--{filter.value}"
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
		{emptyState}
		{lineFor}
		onNavigate={(diagnostic) => controller.navigateToDiagnostic(diagnostic)}
		onChooseHeader={(diagnostic) => controller.chooseSectionHeader(diagnostic)}
		canAssignPerformers={(diagnostic) => controller.canAssignDiagnosticPerformers(diagnostic)}
		onAssignPerformers={(diagnostic) => controller.assignDiagnosticPerformers(diagnostic)}
		onPreviewFix={(diagnostic, fix) => controller.previewFix(diagnostic, fix)}
		onCancelPreview={() => controller.clearFixPreview()}
		onApplyFix={(diagnostic, fix) => controller.applyFix(diagnostic, fix)}
		onIgnore={(ruleId) => controller.ignoreRule(ruleId)}
	/>
	{#if controller.visibleDiagnostics.length > 0}
		<p class="linter-panel__afterword">{afterword}</p>
	{/if}
</div>
