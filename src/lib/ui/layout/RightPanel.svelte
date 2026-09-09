<script lang="ts">
	import ListChecks from 'lucide-svelte/icons/list-checks';
	import Link2 from 'lucide-svelte/icons/link-2';
	import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
	import UsersRound from 'lucide-svelte/icons/users-round';
	import Music2 from 'lucide-svelte/icons/music-2';
	import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
	import { MediaQuery } from 'svelte/reactivity';
	import { untrack } from 'svelte';
	import { Tabs } from 'bits-ui';
	import type { Diagnostic } from '$lib/core/types.js';
	import { assistantAvailable } from '$lib/assistant/api.js';
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import LazyPanel from '$lib/interaction/LazyContent.svelte';
	import LinterPanel from '../linter/LinterPanel.svelte';
	import IgnoredRules from '../linter/IgnoredRules.svelte';
	import MediaVideo from '../media/MediaVideo.svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let {
		controller,
		nativeRulesStatus = 'ready',
		onRetryNativeRules,
		assistant,
		collapsed = false,
		mobile = false,
		reviewFocused = false,
		onOpenFinding,
		onReviewList,
		onRevealIgnored,
		onShowEditor,
		renderVideo = true
	}: {
		controller: WorkbenchController;
		nativeRulesStatus?: 'pending' | 'failed' | 'ready';
		onRetryNativeRules?: () => void;
		assistant?: AssistantState;
		collapsed?: boolean;
		mobile?: boolean;
		reviewFocused?: boolean;
		onOpenFinding?: (diagnostic: Diagnostic) => void;
		onReviewList?: () => void;
		onRevealIgnored?: (diagnostic: Diagnostic) => void;
		onShowEditor?: () => void | Promise<void>;
		renderVideo?: boolean;
	} = $props();

	// Initialize a tool when it is first chosen, then keep its controls and local
	// state mounted across navigation and editor expansion.
	let activatedPanels = $state.raw<ReadonlySet<string>>(
		untrack(() => new Set([controller.activeTab]))
	);
	$effect.pre(() => {
		const tab = controller.activeTab;
		if (!activatedPanels.has(tab)) activatedPanels = new Set([...activatedPanels, tab]);
	});

	// Keep arrow-key navigation aligned with the dock's CSS orientation.
	const verticalDock = new MediaQuery('(min-width: 78rem)');

	const hasMatchingIgnoredDiagnostics = $derived(controller.ignoredDiagnosticMatches.size > 0);

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
			value === 'linking' ||
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
				<Tabs.Trigger id="linking-panel-tab" value="linking">
					<Link2 aria-hidden="true" size={20} strokeWidth={1.75} />
					<span>Linking</span>
				</Tabs.Trigger>
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
					{#if activatedPanels.has('linter')}
						<LinterPanel
							{nativeRulesStatus}
							{onRetryNativeRules}
							{controller}
							active={!collapsed}
							{mobile}
							{reviewFocused}
							{onOpenFinding}
							{onReviewList}
						/>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="performers" class="right-panel__pane">
					{#if activatedPanels.has('performers')}
						<LazyPanel
							name="Performers"
							load={() => import('../performers/PerformersPanel.svelte')}
							panelProps={{
								controller,
								active: !collapsed && controller.activeTab === 'performers'
							}}
						/>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="linking" class="right-panel__pane">
					{#if activatedPanels.has('linking')}
						<LazyPanel
							name="Linking"
							load={() => import('../linking/LinkingPanel.svelte')}
							panelProps={{
								controller,
								onShowEditor,
								active: !collapsed && controller.activeTab === 'linking'
							}}
						/>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="song" class="right-panel__pane">
					{#if activatedPanels.has('song')}
						<LazyPanel
							name="Song"
							load={() => import('../tools/SongPanel.svelte')}
							panelProps={{ controller, active: !collapsed && controller.activeTab === 'song' }}
						/>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="preferences" class="right-panel__pane">
					{#if activatedPanels.has('preferences')}
						<LazyPanel
							name="Preferences"
							load={() => import('../tools/PreferencesPanel.svelte')}
							panelProps={{ controller }}
						/>
					{/if}
				</Tabs.Content>
				<!-- The assistant is the one pane that fits rather than grows: its
			     transcript is its own scroll port, framed between the chat tray above
			     and the composer below, both of which have to stay put while it
			     scrolls. -->
				{#if assistantEnabled && assistant}
					<Tabs.Content value="assistant" class="right-panel__pane right-panel__pane--fit">
						{#if activatedPanels.has('assistant')}
							<LazyPanel
								name="Assistant"
								load={() => import('../assistant/AssistantPanel.svelte')}
								panelProps={{ assistant }}
							/>
						{/if}
					</Tabs.Content>
				{/if}
			</div>

			<!-- The footer is a real boundary only once there is something behind it. -->
			{#if controller.activeTab === 'linter' && hasMatchingIgnoredDiagnostics}
				<footer class="right-panel__footer">
					<IgnoredRules
						diagnosticKeys={controller.ignoredDiagnosticKeys}
						matches={controller.ignoredDiagnosticMatches}
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
