<script lang="ts">
	import { Tabs } from 'bits-ui';
	import LinterPanel from '../linter/LinterPanel.svelte';
	import IgnoredRules from '../linter/IgnoredRules.svelte';
	import PerformersPanel from '../performers/PerformersPanel.svelte';
	import type { RightPanelTab, WorkbenchController } from '../state/workbench.svelte.js';
	import ToolsPanel from '../tools/ToolsPanel.svelte';

	let { controller }: { controller: WorkbenchController } = $props();

	function changeTab(value: string): void {
		if (value === 'linter' || value === 'performers' || value === 'tools') {
			controller.setActiveTab(value as RightPanelTab);
		}
	}
</script>

<aside class="right-panel" aria-label="Document panel">
	<Tabs.Root
		value={controller.activeTab}
		onValueChange={changeTab}
		activationMode="automatic"
		loop
		class="right-panel__tabs-root"
	>
		<div class="right-panel__header">
			<Tabs.List class="panel-tabs" aria-label="Document panels">
				<Tabs.Trigger value="linter">
					Linter
					{#if controller.visibleDiagnostics.length > 0}
						<span
							class="tab-count"
							aria-label={`${controller.visibleDiagnostics.length} visible diagnostics`}
							>{controller.visibleDiagnostics.length}</span
						>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger id="performers-panel-tab" value="performers">Performers</Tabs.Trigger>
				<Tabs.Trigger value="tools">Tools</Tabs.Trigger>
			</Tabs.List>
		</div>

		<div class="right-panel__body">
			<Tabs.Content value="linter"><LinterPanel {controller} /></Tabs.Content>
			<Tabs.Content value="performers"><PerformersPanel {controller} /></Tabs.Content>
			<Tabs.Content value="tools"><ToolsPanel {controller} /></Tabs.Content>
		</div>

		{#if controller.activeTab === 'linter'}
			<footer class="right-panel__footer">
				<IgnoredRules
					ruleIds={controller.ignoredRuleIds}
					onRestore={(ruleId) => controller.restoreRule(ruleId)}
				/>
			</footer>
		{/if}
	</Tabs.Root>
</aside>
