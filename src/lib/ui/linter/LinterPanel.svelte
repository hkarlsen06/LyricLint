<script lang="ts">
	import type { Severity } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import DiagnosticList from './DiagnosticList.svelte';
	import IgnoredRules from './IgnoredRules.svelte';

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
</script>

<div class="panel-content linter-panel">
	<fieldset class="severity-filters">
		<legend class="sr-only">Filter diagnostics by severity</legend>
		{#each filters as filter (filter.value)}
			<label>
				<input
					type="checkbox"
					checked={controller.severityFilter.includes(filter.value)}
					onchange={() => controller.toggleSeverity(filter.value)}
				/>
				<span>{filter.label}</span>
				<span>{counts[filter.value]}</span>
			</label>
		{/each}
	</fieldset>

	<DiagnosticList
		diagnostics={controller.visibleDiagnostics}
		sources={controller.sources}
		onNavigate={(diagnostic) => controller.navigateToDiagnostic(diagnostic)}
		onApplyFix={(diagnostic, fix) => controller.applyFix(diagnostic, fix)}
		onIgnore={(ruleId) => controller.ignoreRule(ruleId)}
	/>

	<IgnoredRules
		ruleIds={controller.ignoredRuleIds}
		onRestore={(ruleId) => controller.restoreRule(ruleId)}
	/>
</div>
