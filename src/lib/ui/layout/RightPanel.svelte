<script lang="ts">
	import { WandSparkles } from 'lucide-svelte';
	import { Tabs } from 'bits-ui';
	import { assistantAvailable } from '$lib/assistant/api.js';
	import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
	import AssistantPanel from '../assistant/AssistantPanel.svelte';
	import LinterPanel from '../linter/LinterPanel.svelte';
	import IgnoredRules from '../linter/IgnoredRules.svelte';
	import MediaVideo from '../media/MediaVideo.svelte';
	import MediaArtwork from '../media/MediaArtwork.svelte';
	import { drawsCoverBand } from '../state/media-player.svelte.js';
	import PerformersPanel from '../performers/PerformersPanel.svelte';
	import type { RightPanelTab, WorkbenchController } from '../state/workbench.svelte.js';
	import SongPanel from '../tools/SongPanel.svelte';
	import PreferencesPanel from '../tools/PreferencesPanel.svelte';

	let {
		controller,
		assistant,
		openMediaPicker,
		footer
	}: {
		controller: WorkbenchController;
		assistant?: AssistantState;
		openMediaPicker?: (source: HTMLButtonElement) => void;
		/**
		 * The window's status bar, handed down while the layout is stacked: there
		 * the panel is the scroll port for everything under the tab strip, and a
		 * band pinned to the floor of a viewport that short is a band taken off the
		 * findings. Absent in the column layout, where it is the grid's own last
		 * row. Workspace.svelte owns the breakpoint.
		 */
		footer?: import('svelte').Snippet;
	} = $props();

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
			controller.setActiveTab(value as RightPanelTab);
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
				<Tabs.Trigger id="linter-panel-tab" value="linter">
					Linter
					{#if controller.visibleDiagnostics.length > 0}
						<span class="tab-count" aria-label={diagnosticBadgeLabel}
							>{controller.visibleDiagnostics.length}</span
						>
					{/if}
				</Tabs.Trigger>
				{#if assistantEnabled}
					<!-- A sparkles glyph rather than the word, because the strip carries five
					     tabs and `Performers` and `Preferences` are the two longest labels in
					     the workbench. The accessible name is the whole word (the e2e suite and
					     a screen reader both look it up by name), and the glyph is `aria-hidden`
					     so nothing announces twice.

					     The diagonal wand reads taller than a word at the same nominal size, so its
					     18px box keeps the visible drawing level with the semibold titles beside it. -->
					<Tabs.Trigger value="assistant" aria-label="Assistant" class="panel-tabs__icon">
						<WandSparkles aria-hidden="true" size={18} strokeWidth={2} />
					</Tabs.Trigger>
				{/if}
				<Tabs.Trigger id="performers-panel-tab" value="performers">Performers</Tabs.Trigger>
				<Tabs.Trigger value="song">Song</Tabs.Trigger>
				<Tabs.Trigger value="preferences">Preferences</Tabs.Trigger>
			</Tabs.List>
		</div>

		<!-- The pane fills the body it sits in rather than hugging its content, so
		     a panel that pins something to its foot — the linter's recent drafts —
		     has a foot to pin it to. -->
		<div class="right-panel__body">
			<Tabs.Content value="linter" class="right-panel__pane">
				<LinterPanel {controller} />
			</Tabs.Content>
			<Tabs.Content value="performers" class="right-panel__pane">
				<PerformersPanel {controller} />
			</Tabs.Content>
			<Tabs.Content value="song" class="right-panel__pane">
				<SongPanel {controller} {openMediaPicker} />
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
		{#if controller.activeTab === 'linter' && controller.ignoredDiagnosticKeys.length > 0}
			<footer class="right-panel__footer">
				<IgnoredRules
					diagnosticKeys={controller.ignoredDiagnosticKeys}
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
		{#if controller.media?.player.sourceKind === 'youtube'}
			<MediaVideo media={controller.media} />
		{/if}

		<!-- The same band, for the sources with a catalogue behind them.

		     It draws on the kind rather than on the picture, and the band itself
		     gates the picture: the cover lands a round trip after the song is
		     attached, so waiting here left the name and the attribution in the
		     transport strip for that long and then moved them down. `drawsCoverBand`
		     is the one answer to that question, shared with the strip, because two
		     conditions for one hand-off is how a title ends up in both rows or in
		     neither.

		     A video is the one source with a picture of its own here, and it is the
		     picture this band would draw. Two bands showing one still — one of them
		     playing it — is the same thing twice, so a video keeps its player and
		     the thumbnail stays where it is only wanted: the tools panel's
		     download. -->
		{#if controller.media && drawsCoverBand(controller.media.player.sourceKind)}
			<MediaArtwork
				media={controller.media}
				open={controller.artworkOpen}
				onToggle={(open) => controller.setArtworkOpen(open)}
			/>
		{/if}

		<!-- Last of all, under the picture: the window's summary is the widest
		     scope in this column, and the order here is by scope. -->
		{@render footer?.()}
	</Tabs.Root>
</aside>
