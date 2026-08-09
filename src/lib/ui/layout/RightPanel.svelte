<script lang="ts">
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
		footer
	}: {
		controller: WorkbenchController;
		assistant?: AssistantState;
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

					     The artwork is Heroicons' `sparkles` (24/solid), MIT —
					     tailwindlabs/heroicons — taken verbatim rather than drawn here, with only
					     the fills changed to `currentColor` so the glyph takes the tab's own
					     state colors. Its art fills the viewBox, which is what the hand-drawn
					     first version got wrong: a path floating in half its box renders at half
					     the size the markup claims. 20px sits optically level with the semibold
					     words either side. -->
					<Tabs.Trigger value="assistant" aria-label="Assistant" class="panel-tabs__icon">
						<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
							<path
								fill-rule="evenodd"
								clip-rule="evenodd"
								fill="currentColor"
								d="M9 4.5C9.33486 4.5 9.62915 4.72198 9.72114 5.04396L10.5343 7.89015C10.8903 9.13593 11.8641 10.1097 13.1099 10.4657L15.956 11.2789C16.278 11.3709 16.5 11.6651 16.5 12C16.5 12.3349 16.278 12.6291 15.956 12.7211L13.1098 13.5343C11.8641 13.8903 10.8903 14.8641 10.5343 16.1099L9.72114 18.956C9.62915 19.278 9.33486 19.5 9 19.5C8.66514 19.5 8.37085 19.278 8.27886 18.956L7.46566 16.1099C7.10972 14.8641 6.13593 13.8903 4.89015 13.5343L2.04396 12.7211C1.72198 12.6291 1.5 12.3349 1.5 12C1.5 11.6651 1.72198 11.3709 2.04396 11.2789L4.89015 10.4657C6.13593 10.1097 7.10972 9.13593 7.46566 7.89015L8.27886 5.04396C8.37085 4.72198 8.66514 4.5 9 4.5Z"
							/>
							<path
								fill-rule="evenodd"
								clip-rule="evenodd"
								fill="currentColor"
								d="M18 1.5C18.3442 1.5 18.6441 1.73422 18.7276 2.0681L18.9865 3.10356C19.2216 4.04406 19.9559 4.7784 20.8964 5.01353L21.9319 5.27239C22.2658 5.35586 22.5 5.65585 22.5 6C22.5 6.34415 22.2658 6.64414 21.9319 6.72761L20.8964 6.98647C19.9559 7.2216 19.2216 7.95594 18.9865 8.89644L18.7276 9.9319C18.6441 10.2658 18.3442 10.5 18 10.5C17.6558 10.5 17.3559 10.2658 17.2724 9.9319L17.0135 8.89644C16.7784 7.95594 16.0441 7.2216 15.1036 6.98647L14.0681 6.72761C13.7342 6.64414 13.5 6.34415 13.5 6C13.5 5.65585 13.7342 5.35586 14.0681 5.27239L15.1036 5.01353C16.0441 4.7784 16.7784 4.04406 17.0135 3.10356L17.2724 2.0681C17.3559 1.73422 17.6558 1.5 18 1.5Z"
							/>
							<path
								fill-rule="evenodd"
								clip-rule="evenodd"
								fill="currentColor"
								d="M16.5 15C16.8228 15 17.1094 15.2066 17.2115 15.5128L17.6058 16.6956C17.7551 17.1435 18.1065 17.4949 18.5544 17.6442L19.7372 18.0385C20.0434 18.1406 20.25 18.4272 20.25 18.75C20.25 19.0728 20.0434 19.3594 19.7372 19.4615L18.5544 19.8558C18.1065 20.0051 17.7551 20.3565 17.6058 20.8044L17.2115 21.9872C17.1094 22.2934 16.8228 22.5 16.5 22.5C16.1772 22.5 15.8906 22.2934 15.7885 21.9872L15.3942 20.8044C15.2449 20.3565 14.8935 20.0051 14.4456 19.8558L13.2628 19.4615C12.9566 19.3594 12.75 19.0728 12.75 18.75C12.75 18.4272 12.9566 18.1406 13.2628 18.0385L14.4456 17.6442C14.8935 17.4949 15.2449 17.1435 15.3942 16.6956L15.7885 15.5128C15.8906 15.2066 16.1772 15 16.5 15Z"
							/>
						</svg>
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
