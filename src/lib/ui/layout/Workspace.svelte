<script lang="ts">
	import type { EditorHandle, EditorSnapshot } from '$lib/core/types.js';
	import type {
		EditorDisplayContext,
		EditorPaneProps,
		LyricEditorCallbacks
	} from '$lib/editor/index.js';
	import {
		assignVoiceGroup,
		assignVoiceLegend,
		insertSectionHeader
	} from '$lib/performers/index.js';
	import { getLanguagePack } from '$lib/languages/registry.js';
	import { resolve } from '$app/paths';
	import { type Component, untrack } from 'svelte';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import {
		buildRuleContext,
		computeDiagnostics,
		resolveVoiceGroupRanges
	} from '../state/wiring.js';
	import DocumentToolbar from './DocumentToolbar.svelte';
	import MediaPicker from '../media/MediaPicker.svelte';
	import MediaStrip from '../media/MediaStrip.svelte';
	import { bindTransportShortcuts } from '../state/media-shortcuts.js';
	import MockEditorPane from './MockEditorPane.svelte';
	import RightPanel from './RightPanel.svelte';

	let {
		controller,
		editorComponent = MockEditorPane
	}: {
		controller: WorkbenchController;
		editorComponent?: Component<EditorPaneProps>;
	} = $props();

	let editorHandle = $state<EditorHandle>(untrack(() => controller.editor));
	const EditorComponent = $derived(editorComponent);

	const reducedMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	// Local on purpose: the codebase has no shared pluralizer, and the status
	// bar is UI chrome (always English), not lyric text, so the language packs
	// under $lib/languages do not apply.
	function count(value: number, noun: string): string {
		return `${value} ${noun}${value === 1 ? '' : 's'}`;
	}

	// Read-only presentation stats for the status bar; derived from the snapshot
	// the controller already holds, never written back.
	const documentStats = $derived.by(() => {
		const parsed = controller.snapshot.parsed;
		const lines = parsed.sections.reduce((total, section) => total + section.lines.length, 0);
		const voiceGroups = new Set(
			parsed.sections.flatMap((section) => section.voiceGroups.map((group) => group.id))
		).size;
		return {
			lines,
			sections: parsed.sections.length,
			performers: controller.performers.length,
			voiceGroups
		};
	});

	// A count worth stating is one that could have been otherwise. On a fresh
	// document all four are zero, which is four more ways for the window to say
	// "empty" to someone who can already see that it is — so each one waits
	// until it has something to report.
	const documentCounts = $derived(
		[
			documentStats.lines > 0 ? count(documentStats.lines, 'line') : undefined,
			documentStats.sections > 0 ? count(documentStats.sections, 'section') : undefined
		].filter((label) => label !== undefined)
	);

	const voiceCounts = $derived(
		[
			documentStats.performers > 0 ? count(documentStats.performers, 'performer') : undefined,
			documentStats.voiceGroups > 0 ? count(documentStats.voiceGroups, 'voice group') : undefined
		].filter((label) => label !== undefined)
	);

	// Run the rule engine for one revision and fold the diagnostics into the
	// snapshot before the controller stores it. Composition revisions reuse the
	// previous result so linting never runs on incomplete IME input.
	let lastDiagnostics: EditorSnapshot['diagnostics'] = [];
	let lastLintKey = '';

	function lintKey(snapshot: EditorSnapshot): string {
		const performerKey = controller.performers
			.map(
				(performer) =>
					`${performer.id}:${performer.normalizedKey}:${performer.aliases.join('\u001f')}`
			)
			.join('\u001e');
		return `${controller.language}\u0000${performerKey}\u0000${snapshot.revision}\u0000${snapshot.text}`;
	}

	function enrichSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
		if (!snapshot.composing) {
			const context = buildRuleContext(
				controller.language,
				controller.performers,
				controller.ruleSet?.version ?? 'unavailable',
				snapshot.revision
			);
			lastDiagnostics = computeDiagnostics(snapshot.parsed, context);
			lastLintKey = lintKey(snapshot);
		}
		return { ...snapshot, diagnostics: lastDiagnostics };
	}

	const editorContext = $derived<EditorDisplayContext>({
		language: controller.language,
		performers: controller.performers,
		ruleSetVersion: controller.ruleSet?.version ?? 'unavailable',
		parsed: controller.snapshot.parsed,
		diagnostics: {
			revision: controller.snapshot.revision,
			items: controller.snapshot.diagnostics.filter(
				(diagnostic) => !controller.ignoredRuleIds.includes(diagnostic.ruleId)
			)
		},
		voiceGroups: resolveVoiceGroupRanges(controller.snapshot.parsed, controller.performers),
		languagePack: getLanguagePack(controller.language),
		reducedMotion,
		sources: [...controller.sources.values()]
	});

	const editorCallbacks: LyricEditorCallbacks = {
		onSnapshot: (snapshot) => controller.onSnapshot(enrichSnapshot(snapshot)),
		// Assignment happens inline in the floating card; the right panel keeps
		// whatever tab the user chose.
		onAssignRequest: () => {},
		onAddPerformer: (displayName) => controller.addPerformer(displayName),
		onPerformerRenamed: ({ performerId, previousName, displayName }) =>
			controller.adoptHeaderRename(performerId, previousName, displayName),
		onSectionHeaderRequest: () => {},
		// Keyboard diagnostic navigation travels to the diagnostic; hovering one in
		// the editor only marks its card, leaving the text under the pointer still.
		onDiagnosticActivate: (diagnostic) => controller.navigateToDiagnostic(diagnostic),
		onDiagnosticHighlight: (diagnostic) => controller.highlightDiagnostic(diagnostic),
		onAnnouncement: (message) => controller.feedback.announce(message),
		createPerformerEdit: ({ range, performerIds }) => {
			const snapshot = controller.snapshot;
			const result = assignVoiceGroup({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				selection: { anchor: range.from, head: range.to },
				performerIds: [...performerIds],
				roster: controller.performers
			});
			if (result.status === 'applied') return result.edit;
			const reason = (result.blocked ?? result.reason).replaceAll('-', ' ');
			controller.feedback.announce(`Performer assignment blocked: ${reason}.`);
			return undefined;
		},
		createPerformerLegendEdit: ({ sectionFrom, assignments, unwrapSlots }) => {
			const snapshot = controller.snapshot;
			const result = assignVoiceLegend({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				sectionFrom,
				assignments: assignments.map((assignment) => ({
					...assignment,
					performerIds: [...assignment.performerIds]
				})),
				roster: controller.performers,
				unwrapSlots
			});
			if (result.status === 'applied') return result.edit;
			controller.feedback.announce('Those section performers could not be assigned.');
			return undefined;
		},
		createSectionHeaderEdit: ({ range, headerName, ordinal, numberedHeaderTerms }) => {
			const snapshot = controller.snapshot;
			const result = insertSectionHeader({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				sectionFrom: range.from,
				headerName,
				ordinal,
				numberedHeaderTerms
			});
			if (result.status === 'applied') return result.edit;
			controller.feedback.announce('That section header could not be inserted here.');
			return undefined;
		},
		onApplyDiagnosticFix: (diagnostic, fix) => controller.applyFix(diagnostic, fix),
		// The popover's batch is the panel card's batch: same planner, same
		// visible diagnostics, so the same fix offers the same count wherever the
		// user meets it.
		countDiagnosticFixBatch: (diagnostic, fix) => controller.fixBatchSize(diagnostic, fix),
		onApplyDiagnosticFixBatch: (diagnostic, fix) => controller.applyFixBatch(diagnostic, fix),
		onIgnoreDiagnostic: (diagnostic) => controller.ignoreRule(diagnostic.ruleId),
		onSetLanguage: (language) => controller.setLanguage(language),
		// The song dropped onto the lyrics it belongs to. The editor recognized the
		// file and knows nothing else about it; where the bytes go is the media
		// store's business. False when the draft has no store yet, so the drop
		// falls back to the editor's own handling rather than vanishing — and the
		// attach is a promise this hook has no way to wait for, which is fine: it
		// reports its own progress in the strip it is about to draw.
		onAudioFileDropped: (file) => {
			const media = controller.media;
			if (!media) return false;
			void media.attachFile(file);
			return true;
		},
		// Read on every typed transaction, so it answers off the source rather than
		// the mirrored readout and does nothing else.
		onRequestMediaTime: () => {
			const player = controller.media?.player;
			return player?.attached ? player.liveTime() : undefined;
		},
		// The marker says "Play from 1:23", so it plays: seeking without starting
		// would leave the user to press a second control to get what the first one
		// promised. The seek cancels the resume rewind on its way through, so
		// playback begins at the anchored moment and not two seconds before it.
		// A whole synced song changes no text, so nothing else would ever write it
		// down. See `onLineAnchorsChanged` on the controller.
		onLineAnchorsChanged: () => controller.onLineAnchorsChanged(),
		onSeekMedia: (time) => {
			const player = controller.media?.player;
			if (!player?.attached) return;
			player.seek(time);
			player.play();
		},
		// The editor owns the mode and this only reacts, which is what keeps the
		// tape and the mode from ever disagreeing: `Escape` and running out of lines
		// end a run without the shell being asked, and both arrive here.
		onLyricSyncChange: (active, startAt) => {
			syncing = active;
			const player = controller.media?.player;
			if (active) {
				// Wherever the editor put the caret, because a run is one pass over the
				// document against one pass of the audio and the two ends have to begin
				// in the same place. That is 0 for a fresh pass and the resumed line's
				// own time for a half-timed song; the editor decides which, because the
				// anchors are the editor's.
				player?.seek(startAt ?? 0);
				player?.play();
				// The tap is a keystroke, so the run cannot start with focus in the
				// button that started it. This is a deliberate focus move into a mode
				// the user just asked for, not the editor grabbing the caret.
				editorHandle?.focus();
			} else {
				player?.pause();
			}
		}
	};

	let syncing = $state(false);

	const lyricSync = {
		get active() {
			return syncing;
		},
		toggle: () => editorHandle?.setLyricSync?.(!syncing)
	};

	$effect(() => {
		controller.setEditorHandle(editorHandle);
	});

	// The transport keys, bound to the window and not to the document. The pause
	// is wanted most at exactly the moments the caret has left the text — reading
	// a finding, aiming a scrubber, renaming the draft — so a binding that only
	// answered inside the editor answered in the wrong half of the loop.
	//
	// Only `controller.media` is read here, so the listener is bound once rather
	// than rebound on every tick of the playhead.
	$effect(() => {
		const media = controller.media;
		if (!media) return;
		return bindTransportShortcuts({
			transport: (action) => {
				if (!media.player.attached) return false;
				media.player.transport(action);
				return true;
			}
		});
	});

	// Where the audio is, pushed into the anchor gutter — which fills one dot and
	// is the entire extent of what playback is permitted to do to the document.
	// It is deliberately not conditional on playing: a paused track still has a
	// position, and showing it is how the user finds their way back to it.
	$effect(() => {
		const player = controller.media?.player;
		editorHandle?.setMediaPlayhead?.(player?.attached ? player.currentTime : undefined);
	});

	// Language and roster changes do not create a CodeMirror transaction. Re-run
	// the rules against the current immutable document so the selector updates
	// diagnostics immediately instead of waiting for the next keystroke.
	$effect(() => {
		const current = controller.snapshot;
		const key = lintKey(current);
		if (current.composing || key === lastLintKey) return;
		controller.onSnapshot(enrichSnapshot(current));
	});
</script>

<main class="workspace" data-testid="workspace">
	<h1 class="sr-only">LyricLint transcription workbench</h1>

	<!-- The toolbar spans both columns: the draft's name, its save state, and the
	     commands that act on the whole document belong to the window, not to the
	     editor half of it. The panel's tabs then hang directly under it. -->
	<DocumentToolbar {controller} />

	<section class="editor-region" aria-label="Lyrics workspace">
		<div class="editor-host" data-testid="editor-region">
			{#key controller.draftId}
				<EditorComponent
					initialText={controller.snapshot.text}
					initialSelection={controller.snapshot.selection}
					initialRevision={controller.snapshot.revision}
					context={editorContext}
					callbacks={editorCallbacks}
					bind:handle={editorHandle}
				/>
			{/key}
		</div>

		<!-- Only when there is something to control: an empty transport reports a
		     state that could not have been otherwise, which is the same reason the
		     status bar's counts wait for a count worth stating. -->
		{#if controller.media && (controller.media.player.attached || controller.media.pendingName)}
			<MediaStrip media={controller.media} sync={lyricSync} />
		{/if}
	</section>

	<RightPanel {controller} />

	<footer class="status-bar" aria-label="Document summary">
		<span class="status-bar__group">
			<!-- The way in to the audio, in the row the transport itself appears
			     directly above. It is a control among readouts, so unlike the counts
			     it does not wait for something to report — a stable slot with a
			     label that follows the state is what makes it findable at all. -->
			{#if controller.media}
				<MediaPicker media={controller.media} />
			{/if}
			{#if documentCounts.length > 0}
				<span>{documentCounts.join(' · ')}</span>
			{/if}
			{#if voiceCounts.length > 0}
				<span>{voiceCounts.join(' · ')}</span>
			{/if}
		</span>
		<!-- The way out of the workbench, and the only one on the desktop layout.
		     It belongs here rather than in the toolbar for two reasons: the toolbar
		     holds commands that act on the document and this acts on nothing, and
		     anyone already inside the app has no need to be told what the app is.
		     What they do need, occasionally, is a URL to hand someone else — so it
		     sits in the quietest persistent row on the screen.

		     It is the whole end of the row now. "offline ready" was a fact about
		     the app rather than about the document this row summarises, and the
		     two keystroke hints were a legend for shortcuts nobody had asked for
		     help with — three items of chrome to make one link look less alone. -->
		<span class="status-bar__group">
			<a class="status-bar__link" href={resolve('/')}>About LyricLint</a>
		</span>
	</footer>
</main>
