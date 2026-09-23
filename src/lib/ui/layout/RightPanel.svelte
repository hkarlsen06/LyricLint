<script lang="ts">
	import ListChecksIcon from 'phosphor-svelte/lib/ListChecksIcon';
	import LinkSimpleHorizontalIcon from 'phosphor-svelte/lib/LinkSimpleHorizontalIcon';
	import MagicWandIcon from 'phosphor-svelte/lib/MagicWandIcon';
	import UsersThreeIcon from 'phosphor-svelte/lib/UsersThreeIcon';
	import MusicNoteIcon from 'phosphor-svelte/lib/MusicNoteIcon';
	import SlidersHorizontalIcon from 'phosphor-svelte/lib/SlidersHorizontalIcon';
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
	// the noun appears, and "1 visible diagnostics" is exactly the kind of thing
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
	 * filters as well: pressed a second time from inside the linter, it showed
	 * or hid the chips. That took three handlers to get right (pointerdown
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
							<ListChecksIcon aria-hidden="true" size={20} />
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
					<LinkSimpleHorizontalIcon aria-hidden="true" size={20} />
					<span>Linking</span>
				</Tabs.Trigger>
				{#if assistantEnabled}
					<Tabs.Trigger value="assistant" aria-label="Assistant">
						<MagicWandIcon aria-hidden="true" size={20} />
						<span>Assistant</span>
					</Tabs.Trigger>
				{/if}
				<Tabs.Trigger id="performers-panel-tab" value="performers">
					<UsersThreeIcon aria-hidden="true" size={20} />
					<span>Performers</span>
				</Tabs.Trigger>
				<Tabs.Trigger value="song">
					<MusicNoteIcon aria-hidden="true" size={20} />
					<span>Song</span>
				</Tabs.Trigger>
				<Tabs.Trigger value="preferences" class="panel-tabs__preferences">
					<SlidersHorizontalIcon aria-hidden="true" size={20} />
					<span>Preferences</span>
				</Tabs.Trigger>
			</Tabs.List>
		</div>

		<div class="right-panel__content">
			<!-- The pane fills the body it sits in rather than hugging its content, so
		     a panel that pins something to its foot, such as the linter's recent drafts,
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

<style>
	/* The column itself (`.right-panel`) is drawn by this component and by the
	   workspace's loading stand-in, so its own rules stay in `panel.css`. Bits UI
	   renders the tab root, list, triggers, and panes, so they are reached through
	   `:global()` from an element this template owns. */

	/* The dock and the content have independent jobs. The content column keeps
	   its scroll port, set-aside findings, and media alive across tab switches. */
	.right-panel :global(.right-panel__tabs-root) {
		display: flex;
		height: 100%;
		min-height: 0;
		flex-direction: column;
	}

	.right-panel__content {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 0;
		flex-direction: column;
		gap: var(--space-2);
		padding-inline: var(--space-3) var(--space-1);
	}

	/* Positioned so it is the containing block for anything absolute inside the
	   diagnostic cards; otherwise such a box resolves against the shell and its
	   offset down this long list leaks out as shell-level scrollable overflow.

	   A column too, so the active pane inherits the height the body was given
	   instead of collapsing onto its content: the linter's foot (the recent
	   drafts) is at the bottom of the panel, which only means anything if the
	   panel's height reaches the pane that draws it. A pane taller than the body
	   still grows and scrolls, because it is only told to fill, never to fit. */
	.right-panel__body {
		position: relative;
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		overflow: auto;
		border: 0;
		border-radius: var(--radius-panel);
		background: var(--color-chrome);
		scrollbar-width: thin;
	}

	/* `:not([hidden])` is load bearing: Bits UI hides the inactive panes with the
	   attribute, and a bare `display: flex` here outranks the UA rule that honours
	   it, and all four panels stack up in one column. */
	.right-panel__body :global(.right-panel__pane:not([hidden])) {
		display: flex;
		flex: 1;
		flex-direction: column;
	}

	/* A pane that carries its own chrome at both ends has to fit the body instead
	   of growing it: grown, the body becomes the scroll port for the whole pane, so
	   the assistant's chat tray scrolled off the top and its composer sat below the
	   fold: the two controls a conversation is driven from, both unreachable while
	   reading it. `min-height: 0` is what lets a flex column shrink under its own
	   content; without it the automatic minimum size is that content and the
	   overflow reappears in the body. Stacked, the whole column is the scroll port
	   instead and this is not enough on its own; the 68rem block below makes the
	   same exception there, and the two have to move together. */
	.right-panel__body :global(.right-panel__pane--fit:not([hidden])) {
		min-height: 0;
		overflow: hidden;
	}

	/* Chrome at both ends of the panel: the tab strip above, this below, and the
	   scrolling list of diagnostics framed between them. */
	.right-panel__footer {
		flex: none;
		padding: 0 var(--space-4) var(--space-2-5);
		background: var(--color-chrome);
	}

	/* The desktop rail and composer share an outer inset. Measure the filled
	   control edges: matching a label baseline leaves unequal canvas around them. */
	.right-panel__header {
		z-index: calc(var(--layer-toolbar) - 1);
		display: flex;
		flex: none;
		padding: var(--space-2) var(--space-3);
		background: var(--color-chrome);
	}

	.right-panel__header :global(.panel-tabs) {
		display: flex;
		width: 100%;
		gap: var(--space-1);
		overflow-x: auto;
		scrollbar-width: none;
	}

	.right-panel__header :global(.panel-tabs::-webkit-scrollbar) {
		display: none;
	}

	.right-panel__header :global(.panel-tabs button) {
		position: relative;
		display: flex;
		flex: 1 0 0;
		min-width: max-content;
		min-height: var(--control-height-lg);
		flex-direction: column;
		padding: var(--space-2) var(--space-1);
		border: 0;
		border-radius: var(--radius-control);
		gap: var(--space-1-5);
		align-items: center;
		justify-content: center;
		background: transparent;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
		transition: background var(--duration-fast) var(--ease-out-quart);
	}

	.right-panel__header :global(.panel-tabs button[data-state='active']) {
		background: var(--color-surface);
		color: var(--color-text);
		font-weight: var(--font-weight-semibold);
	}

	.right-panel__header :global(.panel-tabs button:hover) {
		background: var(--color-fill);
		color: var(--color-text);
	}

	.tab-count {
		display: inline-grid;
		min-width: var(--space-4);
		height: var(--space-4);
		padding: 0 var(--space-1);
		place-items: center;
		border-radius: var(--radius-pill);
		background: var(--color-fill-strong);
		color: var(--color-text);
		font-size: var(--font-size-2xs);
		font-weight: var(--font-weight-semibold);
		font-variant-numeric: tabular-nums;
	}

	.panel-tabs__mark {
		display: inline-flex;
		order: -1;
		gap: var(--space-1);
		align-items: center;
	}

	@media (min-width: 78rem) {
		.right-panel :global(.right-panel__tabs-root) {
			flex-direction: row-reverse;
		}

		.right-panel__header {
			width: max-content;
			padding: var(--panel-edge-inset);
			margin-inline-start: var(--space-2);
		}

		.right-panel__header :global(.panel-tabs) {
			flex-direction: column;
			min-height: 0;
			overflow: auto;
			gap: var(--space-2);
		}

		.right-panel__header :global(.panel-tabs button) {
			flex: none;
			min-height: calc(var(--space-7) * 2);
			flex-direction: column;
			padding: var(--space-2) var(--space-1);
			gap: var(--space-2);
			font-size: var(--font-size-xs);
		}

		.right-panel__header :global(.panel-tabs .panel-tabs__preferences) {
			margin-top: auto;
			/* The final tool hugs its content; the rail owns its outer clearance. */
			min-height: 0;
		}
	}

	/* Stacked under the editor, what changes for the panel is where its scroll port
	   is: in the column layout the list scrolls between two pinned bands, which is
	   right for a full-height column and wrong for a row two fifths of a short
	   viewport, where the video is most of what the pinning leaves. So the whole
	   panel scrolls instead: tab strip pinned because it is how the user changes
	   what is under it, and everything else, the findings, the player, and the
	   ignored-rules footer, reached by scrolling to the bottom of it. */
	@media (max-width: 68rem) {
		.right-panel :global(.right-panel__tabs-root) {
			overflow: auto;
		}

		.right-panel__header {
			position: sticky;
			top: 0;
		}

		.right-panel__content {
			padding-inline: var(--space-2);
			flex: 1 0 auto;
		}

		.right-panel__content:has(:global(.right-panel__pane--fit:not([hidden]))) {
			flex: 1;
			overflow: hidden;
		}

		/* The body gives up its own scroll port to the column above it, and grows
		   instead: `1 0 auto` is what puts the trailing bands (the footer, the
		   player, the status bar) on the floor of the panel when the findings are
		   short of filling it, and leaves them exactly where the content ends when
		   they are not. It never shrinks, or a long list would be squeezed to fit
		   rather than scrolled through. */
		.right-panel__body {
			flex: 1 0 auto;
			overflow: visible;
		}

		/* The assistant is the exception to the panel scrolling as one column, and it
		   is the same exception it makes on a wide screen: a conversation is driven
		   from the two controls at its ends (the chat tray above, the composer below),
		   so scrolling the column to read it takes both away, and the composer is
		   the one thing a reader wants at the moment they have finished reading. The
		   column keeps its own overflow while such a pane is active and the body takes
		   what is left rather than growing past it, so the transcript is the scroll
		   port and everything under it (the player, the status bar) stays on the
		   floor of the panel where a fitted column puts it. */
		.right-panel :global(.right-panel__tabs-root:has(.right-panel__pane--fit:not([hidden]))) {
			overflow: hidden;
		}

		.right-panel__body:has(> :global(.right-panel__pane--fit:not([hidden]))) {
			flex: 1 1 auto;
			overflow: hidden;
		}
	}

	/* Phone task views: keep this query aligned with PHONE_WORKSPACE_QUERY. */
	@media (pointer: coarse) and (max-width: 68rem) {
		:global(.workspace) .right-panel :global(.right-panel__tabs-root) {
			overflow: hidden;
		}
		:global(.workspace) .right-panel__content {
			flex: 1;
			overflow: auto;
		}
		:global(.workspace) .right-panel__body {
			flex: 1 0 auto;
		}
		:global(.workspace) .right-panel__content:has(:global(.right-panel__pane--fit:not([hidden]))) {
			overflow: hidden;
		}
		:global(.workspace) .right-panel__body:has(:global(.right-panel__pane--fit:not([hidden]))) {
			flex: 1;
			overflow: hidden;
		}
		:global(.workspace[data-mobile-view='review']) .right-panel__header {
			display: none;
		}
		:global(.workspace[data-mobile-view='tools']) .right-panel__header :global(#linter-panel-tab) {
			display: none;
		}
		:global(.workspace) .right-panel__header :global(.panel-tabs) {
			flex-wrap: wrap;
			overflow: visible;
		}
		:global(.workspace) .right-panel__header :global(.panel-tabs button) {
			flex-direction: row;
			min-height: var(--control-height-touch);
		}
		:global(.workspace) .right-panel__header :global(.panel-tabs button svg) {
			display: none;
		}
	}
</style>
