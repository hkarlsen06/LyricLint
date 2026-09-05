<script lang="ts">
	import { ListChecks, WandSparkles, UsersRound, Music2, SlidersHorizontal } from 'lucide-svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { Tabs } from 'bits-ui';
	import type { Diagnostic } from '$lib/core/types.js';
	import { assistantAvailable } from '$lib/assistant/api.js';
	import { matchIgnoredDiagnostics } from '$lib/diagnostics/ignore.js';
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import AssistantPanel from '../assistant/AssistantPanel.svelte';
	import LinterPanel from '../linter/LinterPanel.svelte';
	import IgnoredRules from '../linter/IgnoredRules.svelte';
	import MediaVideo from '../media/MediaVideo.svelte';
	import PerformersPanel from '../performers/PerformersPanel.svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import SongPanel from '../tools/SongPanel.svelte';
	import PreferencesPanel from '../tools/PreferencesPanel.svelte';

	let {
		controller,
		assistant,
		collapsed = false,
		mobile = false,
		reviewFocused = false,
		onOpenFinding,
		onReviewList,
		onRevealIgnored,
		renderVideo = true
	}: {
		controller: WorkbenchController;
		assistant?: AssistantState;
		collapsed?: boolean;
		mobile?: boolean;
		reviewFocused?: boolean;
		onOpenFinding?: (diagnostic: Diagnostic) => void;
		onReviewList?: () => void;
		onRevealIgnored?: (diagnostic: Diagnostic) => void;
		renderVideo?: boolean;
	} = $props();

	// Keep arrow-key navigation aligned with the dock's CSS orientation.
	const verticalDock = new MediaQuery('(min-width: 78rem)');

	const hasMatchingIgnoredDiagnostics = $derived(
		matchIgnoredDiagnostics(
			controller.snapshot.diagnostics,
			controller.snapshot.text,
			controller.ignoredDiagnosticKeys
		).size > 0
	);

	const assistantEnabled = $derived(assistant !== undefined && assistantAvailable());

	// A bookmarked Assistant tab still needs a pane in a build where the service
	// is disabled. Fall back to the default rather than leaving the panel body
	// with no active content.
	$effect(() => {
		if (!assistantEnabled && controller.activeTab === 'assistant') {
			controller.setActiveTab('linter');
		}
	});

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
		if (
			value === 'linter' ||
			value === 'performers' ||
			value === 'song' ||
			value === 'preferences' ||
			(value === 'assistant' && assistantEnabled)
		) {
			controller.setActiveTab(value);
		}
	}

	/*
	 * The Linter tab is a tab and nothing else. It used to carry the severity
	 * filters as well — pressed a second time from inside the linter, it showed
	 * or hid the chips — which took three handlers to get right (pointerdown
	 * ahead of Bits UI's focus activation, a separate keydown path because Bits
	 * UI prevents the click that would otherwise follow Enter) and was found by
	 * nobody, because a tab advertises switching panels and nothing else. The
	 * chips draw themselves now, for the kinds the document actually has.
	 */
</script>

<aside
	id="document-panel"
	class="right-panel"
	aria-label="Document panel"
	aria-hidden={collapsed}
	inert={collapsed}
>
	<Tabs.Root
		value={controller.activeTab}
		onValueChange={changeTab}
		orientation={verticalDock.current ? 'vertical' : 'horizontal'}
		activationMode="automatic"
		loop
		class="right-panel__tabs-root"
	>
		<div class="right-panel__header">
			<Tabs.List class="panel-tabs" aria-label="Document panels">
				{#if !mobile || controller.activeTab === 'linter'}
					<Tabs.Trigger id="linter-panel-tab" value="linter">
						<span>Review</span>
						<span class="panel-tabs__mark">
							<ListChecks aria-hidden="true" size={20} strokeWidth={1.75} />
							{#if controller.visibleDiagnostics.length > 0}
								<!-- `role="img"`, the toast count's own pattern: a name on a bare
							     `<span>` has no role to attach to, so the badge reached the
							     tab's accessible name as a loose number with nothing saying
							     what it counted. -->
								<span class="tab-count" role="img" aria-label={diagnosticBadgeLabel}
									>{controller.visibleDiagnostics.length}</span
								>
							{/if}
						</span>
					</Tabs.Trigger>
				{/if}
				{#if assistantEnabled}
					<Tabs.Trigger value="assistant" aria-label="Assistant">
						<WandSparkles aria-hidden="true" size={20} strokeWidth={1.75} />
						<span>Assistant</span>
					</Tabs.Trigger>
				{/if}
				<Tabs.Trigger id="performers-panel-tab" value="performers">
					<UsersRound aria-hidden="true" size={20} strokeWidth={1.75} />
					<span>Performers</span>
				</Tabs.Trigger>
				<Tabs.Trigger value="song">
					<Music2 aria-hidden="true" size={20} strokeWidth={1.75} />
					<span>Song</span>
				</Tabs.Trigger>
				<Tabs.Trigger value="preferences" class="panel-tabs__preferences">
					<SlidersHorizontal aria-hidden="true" size={20} strokeWidth={1.75} />
					<span>Preferences</span>
				</Tabs.Trigger>
			</Tabs.List>
		</div>

		<div class="right-panel__content">
			<!-- The pane fills the body it sits in rather than hugging its content, so
		     a panel that pins something to its foot — the linter's recent drafts —
		     has a foot to pin it to. -->
			<div class="right-panel__body">
				<Tabs.Content value="linter" class="right-panel__pane">
					<LinterPanel
						{controller}
						active={!collapsed}
						{mobile}
						{reviewFocused}
						{onOpenFinding}
						{onReviewList}
					/>
				</Tabs.Content>
				<Tabs.Content value="performers" class="right-panel__pane">
					<PerformersPanel {controller} />
				</Tabs.Content>
				<Tabs.Content value="song" class="right-panel__pane">
					<SongPanel {controller} />
				</Tabs.Content>
				<Tabs.Content value="preferences" class="right-panel__pane">
					<PreferencesPanel {controller} />
				</Tabs.Content>
				<!-- The assistant is the one pane that fits rather than grows: its
			     transcript is its own scroll port, framed between the chat tray above
			     and the composer below, both of which have to stay put while it
			     scrolls. -->
				{#if assistantEnabled && assistant}
					<Tabs.Content value="assistant" class="right-panel__pane right-panel__pane--fit">
						<AssistantPanel {assistant} />
					</Tabs.Content>
				{/if}
			</div>

			<!-- The footer is a real boundary only once there is something behind it. -->
			{#if controller.activeTab === 'linter' && hasMatchingIgnoredDiagnostics}
				<footer class="right-panel__footer">
					<IgnoredRules
						diagnosticKeys={controller.ignoredDiagnosticKeys}
						snapshot={controller.snapshot}
						onReveal={onRevealIgnored ??
							((diagnostic) => controller.navigateToDiagnostic(diagnostic))}
						onRestore={(key) => controller.restoreDiagnostic(key)}
					/>
				</footer>
			{/if}

			<!-- The video is the last band in the column, under the ignored-rules footer
		     rather than over it, and the order is by scope: the pane, then the
		     chrome belonging to that one pane, then the chrome belonging to the
		     window. A picture that survives every tab switch cannot sit above a bar
		     that only exists inside the linter, or switching tabs would move it.

		     It is here and not in the editor column because it is the one part of
		     the media feature that is looked at rather than operated: two hundred
		     pixels taken off a scrolling list of findings costs a scroll, and the
		     same two hundred taken off the document costs the thing being typed
		     into. The transport stays under the editor, which is the honest reading
		     of what it controls. -->
			{#if renderVideo && controller.media?.player.sourceKind === 'youtube'}
				<MediaVideo media={controller.media} />
			{/if}
		</div>
	</Tabs.Root>
</aside>
