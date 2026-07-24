<script lang="ts">
	import { Tabs } from 'bits-ui';
	import LinterPanel from '../linter/LinterPanel.svelte';
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
	<Tabs.Root value={controller.activeTab} onValueChange={changeTab} activationMode="automatic" loop>
		<div class="right-panel__header">
			<Tabs.List class="panel-tabs" aria-label="Document panels">
				<Tabs.Trigger value="linter">
					Linter
					{#if controller.ignoredRuleCount > 0}
						<span class="tab-count" aria-label={`${controller.ignoredRuleCount} ignored rules`}
							>{controller.ignoredRuleCount}</span
						>
					{/if}
				</Tabs.Trigger>
				<Tabs.Trigger id="performers-panel-tab" value="performers">Performers</Tabs.Trigger>
				<Tabs.Trigger value="tools">Tools</Tabs.Trigger>
			</Tabs.List>
			<button
				type="button"
				class="icon-button"
				aria-label="Hide right panel"
				onclick={() => controller.setPanelCollapsed(true)}>×</button
			>
		</div>

		<Tabs.Content value="linter"><LinterPanel {controller} /></Tabs.Content>
		<Tabs.Content value="performers"><PerformersPanel {controller} /></Tabs.Content>
		<Tabs.Content value="tools"><ToolsPanel {controller} /></Tabs.Content>
	</Tabs.Root>
</aside>
