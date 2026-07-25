<script lang="ts">
	import { Tabs } from 'bits-ui';
	import LinterPanel from '../linter/LinterPanel.svelte';
	import IgnoredRules from '../linter/IgnoredRules.svelte';
	import PerformersPanel from '../performers/PerformersPanel.svelte';
	import type { RightPanelTab, WorkbenchController } from '../state/workbench.svelte.js';
	import ToolsPanel from '../tools/ToolsPanel.svelte';

	let { controller }: { controller: WorkbenchController } = $props();

	// The badge shows a bare numeral, so its accessible name is the only place
	// the noun appears — and "1 visible diagnostics" is exactly the kind of thing
	// a screen reader user hears in full. Local for the same reason as the status
	// bar's helper in Workspace.svelte: tab chrome is always English, so the
	// lyric-language packs under $lib/languages do not apply.
	const diagnosticBadgeLabel = $derived(
		`${controller.visibleDiagnostics.length} visible diagnostic${
			controller.visibleDiagnostics.length === 1 ? '' : 's'
		}`
	);

	function changeTab(value: string): void {
		if (value === 'linter' || value === 'performers' || value === 'tools') {
			controller.setActiveTab(value as RightPanelTab);
		}
	}

	/*
	 * The severity filters have no control of their own; the Linter tab is it.
	 * Pressing the tab from another panel only comes back to the linter, and
	 * pressing it again — while already inside — shows or hides the chips.
	 *
	 * Both handlers run before Bits UI activates the tab (it composes props
	 * handlers ahead of its own), so `activeTab` here is still the tab the user
	 * was on when they pressed. Keyboard needs its own path: Bits UI activates
	 * Enter and Space from `keydown` and calls `preventDefault`, so no click
	 * follows to be heard.
	 */
	function pressLinterTab(): void {
		if (controller.activeTab !== 'linter') return;
		const open = controller.toggleSeverityFilters();
		controller.feedback.announce(open ? 'Severity filters shown.' : 'Severity filters hidden.');
	}

	function pressLinterTabByKey(event: KeyboardEvent): void {
		// Arrow keys move between tabs and activate on focus; that is a switch,
		// not a second press on the tab the user is already in.
		if (event.key === 'Enter' || event.key === ' ') pressLinterTab();
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
				<Tabs.Trigger
					id="linter-panel-tab"
					value="linter"
					title="Linter — press again to show the severity filters"
					onkeydown={pressLinterTabByKey}
					onclick={pressLinterTab}
				>
					Linter
					{#if controller.visibleDiagnostics.length > 0}
						<span class="tab-count" aria-label={diagnosticBadgeLabel}
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

		<!-- The footer is a real boundary only once there is something behind it;
		     an empty "No rules ignored this session" bar is chrome announcing its
		     own emptiness, so it stays out of the panel until a rule is ignored. -->
		{#if controller.activeTab === 'linter' && controller.ignoredRuleIds.length > 0}
			<footer class="right-panel__footer">
				<IgnoredRules
					ruleIds={controller.ignoredRuleIds}
					onRestore={(ruleId) => controller.restoreRule(ruleId)}
				/>
			</footer>
		{/if}
	</Tabs.Root>
</aside>
