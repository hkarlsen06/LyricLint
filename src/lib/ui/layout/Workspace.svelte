<script lang="ts">
	import type { EditorHandle, EditorSnapshot, LineAnchor } from '$lib/core/types.js';
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
	import { getLanguagePack, resolveLanguageTag } from '$lib/languages/registry.js';
	import { loadStatisticalLanguageDetector } from '$lib/languages/detect.js';
	import {
		createHarperDiagnosticProvider,
		mergeHarperDiagnostics,
		type HarperDiagnosticProvider
	} from '$lib/rules/index.js';
	import { resolve } from '$app/paths';
	import { onDestroy, type Component, untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import {
		buildRuleContext,
		computeDiagnostics,
		everyLyricLineTimed,
		resolveVoiceGroupRanges
	} from '../state/wiring.js';
	import DocumentToolbar from './DocumentToolbar.svelte';
	import MediaPicker from '../media/MediaPicker.svelte';
	import MediaStrip from '../media/MediaStrip.svelte';
	import { bindTransportShortcuts } from '../state/media-shortcuts.js';
	import { trackKeyboardInset } from '../state/keyboard-inset.js';
	import MockEditorPane from './MockEditorPane.svelte';
	import RightPanel from './RightPanel.svelte';

	let {
		controller,
		editorComponent = MockEditorPane,
		harperProvider = createHarperDiagnosticProvider()
	}: {
		controller: WorkbenchController;
		editorComponent?: Component<EditorPaneProps>;
		/** Injectable so component tests never need to instantiate the WASM worker. */
		harperProvider?: HarperDiagnosticProvider;
	} = $props();

	let editorHandle = $state<EditorHandle>(untrack(() => controller.editor));
	const EditorComponent = $derived(editorComponent);

	/** The stacked layout, in step with the `68rem` block in responsive.css. */
	const stacked = new MediaQuery('(max-width: 68rem)');

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
	let harperTimer: ReturnType<typeof setTimeout> | undefined;
	let harperRequest = 0;
	let harperUnavailable = false;
	let languageDetectorTimer: ReturnType<typeof setTimeout> | undefined;
	let languageDetectorStarted = false;
	let destroyed = false;
	const harperDelay = 250;
	const languageDetectorDelay = 150;

	function lintKey(snapshot: EditorSnapshot): string {
		const performerKey = controller.performers
			.map(
				(performer) =>
					`${performer.id}:${performer.normalizedKey}:${performer.aliases.join('\u001f')}`
			)
			.join('\u001e');
		return `${controller.language}\u0000${performerKey}\u0000${snapshot.revision}\u0000${snapshot.text}`;
	}

	function invalidateHarper(): number {
		harperRequest += 1;
		if (harperTimer !== undefined) {
			clearTimeout(harperTimer);
			harperTimer = undefined;
		}
		return harperRequest;
	}

	function scheduleHarper(
		snapshot: EditorSnapshot,
		nativeDiagnostics: EditorSnapshot['diagnostics']
	): void {
		const request = invalidateHarper();
		if (
			harperUnavailable ||
			resolveLanguageTag(controller.language) !== 'en' ||
			snapshot.text.trim().length === 0
		) {
			return;
		}

		const key = `${controller.draftId}\u0000${lintKey(snapshot)}`;
		const language = controller.language;
		const performers = [...controller.performers];
		harperTimer = setTimeout(() => {
			harperTimer = undefined;
			void harperProvider
				.lint({
					text: snapshot.text,
					document: snapshot.parsed,
					language,
					performers,
					revision: snapshot.revision
				})
				.then((harperDiagnostics) => {
					const current = controller.snapshot;
					if (
						request !== harperRequest ||
						current.composing ||
						`${controller.draftId}\u0000${lintKey(current)}` !== key
					) {
						return;
					}

					const merged = mergeHarperDiagnostics(nativeDiagnostics, harperDiagnostics);
					if (merged.length === nativeDiagnostics.length) return;
					lastDiagnostics = merged;
					controller.onSnapshot({ ...current, diagnostics: merged });
				})
				.catch((error: unknown) => {
					if (request !== harperRequest || harperUnavailable) return;
					harperUnavailable = true;
					console.error('Harper grammar checking is unavailable.', error);
				});
		}, harperDelay);
	}

	function scheduleLanguageDetector(snapshot: EditorSnapshot): void {
		if (languageDetectorStarted) return;
		if (languageDetectorTimer !== undefined) clearTimeout(languageDetectorTimer);
		if (snapshot.text.length < 40) return;

		languageDetectorTimer = setTimeout(() => {
			languageDetectorTimer = undefined;
			languageDetectorStarted = true;
			void loadStatisticalLanguageDetector()
				.then(() => {
					if (destroyed) return;
					lastLintKey = '';
					controller.onSnapshot(enrichSnapshot(controller.snapshot));
				})
				.catch((error: unknown) => console.error('Language recognition is unavailable.', error));
		}, languageDetectorDelay);
	}

	function enrichSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
		if (!snapshot.composing) {
			const key = lintKey(snapshot);
			if (key === lastLintKey) {
				return { ...snapshot, diagnostics: lastDiagnostics };
			}
			const context = buildRuleContext(
				controller.language,
				controller.performers,
				controller.ruleSet?.version ?? 'unavailable',
				snapshot.revision
			);
			lastDiagnostics = computeDiagnostics(snapshot.parsed, context);
			lastLintKey = key;
			scheduleLanguageDetector(snapshot);
			scheduleHarper(snapshot, lastDiagnostics);
		} else {
			invalidateHarper();
		}
		return { ...snapshot, diagnostics: lastDiagnostics };
	}

	onDestroy(() => {
		destroyed = true;
		if (languageDetectorTimer !== undefined) clearTimeout(languageDetectorTimer);
		invalidateHarper();
		void harperProvider
			.dispose()
			.catch((error: unknown) => console.error('Harper worker cleanup failed.', error));
	});

	const editorContext = $derived<EditorDisplayContext>({
		language: controller.language,
		performers: controller.performers,
		ruleSetVersion: controller.ruleSet?.version ?? 'unavailable',
		parsed: controller.snapshot.parsed,
		diagnostics: {
			revision: controller.snapshot.revision,
			items: controller.unignoredDiagnostics
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
		createPerformerEdit: ({ range, performerIds, sectionPerformerIds }) => {
			const snapshot = controller.snapshot;
			const result = assignVoiceGroup({
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				selection: { anchor: range.from, head: range.to },
				performerIds: [...performerIds],
				sectionPerformerIds,
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
		onIgnoreDiagnostic: (diagnostic) => controller.ignoreDiagnostic(diagnostic),
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
		onLineAnchorsChanged: () => {
			anchors = editorHandle?.getLineAnchors?.() ?? [];
			controller.onLineAnchorsChanged();
		},
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
	let following = $state(true);
	let anchors = $state<readonly LineAnchor[]>([]);
	const anchorCount = $derived(anchors.length);

	// Read off the snapshot rather than asked for through the handle: the anchors
	// carry their own line numbers and the text is already here.
	const allLinesTimed = $derived(everyLyricLineTimed(controller.snapshot.text, anchors));

	// Two timed lines is the floor for a scroll to mean anything: with one, the
	// document never moves and the control would promise something it cannot do.
	const followControl = {
		get available() {
			return anchorCount >= 2;
		},
		get active() {
			return following;
		},
		toggle: () => {
			following = !following;
			editorHandle?.setFollowPlayhead?.(following);
		}
	};

	const lyricSync = {
		get active() {
			return syncing;
		},
		get complete() {
			return allLinesTimed;
		},
		toggle: () => editorHandle?.setLyricSync?.(!syncing),
		tap: () => editorHandle?.tapLyricSync?.()
	};

	$effect(() => {
		controller.setEditorHandle(editorHandle);
		// Read the anchors back on the same pass, because that call is where a
		// remount gets the draft's own timings re-seated onto it — through
		// `setLineAnchors`, which deliberately reports nothing (it is the draft being
		// read back, not changed). Without this the shell's copy stays as it was left
		// by whichever editor is being replaced, and with a paused track nothing else
		// re-reads it: a fully timed song comes back from a draft switch still
		// offering `Sync lyrics`, and the follow control still hidden.
		anchors = editorHandle?.getLineAnchors?.() ?? [];
	});

	// The transport keys, bound to the window and not to the document. The pause
	// is wanted most at exactly the moments the caret has left the text — reading
	// a finding, aiming a scrubber, renaming the draft — so a binding that only
	// answered inside the editor answered in the wrong half of the loop.
	//
	// Attachment state is the only reactive player value read here, so the
	// listener follows attach and detach without rebinding on every playhead tick.
	$effect(() => {
		const player = controller.media?.player;
		if (!player?.attached) return;
		return bindTransportShortcuts({
			transport: (action) => {
				if (!player.attached) return false;
				player.transport(action);
				return true;
			},
			play: () => {
				if (!player.attached) return false;
				player.play();
				return true;
			},
			pause: () => {
				if (!player.attached) return false;
				player.pause();
				return true;
			}
		});
	});

	// The software keyboard's height, published for `responsive.css` to hang the
	// transport on. It runs whenever the workbench is mounted rather than only
	// while audio is attached: the measurement costs nothing until a keyboard
	// opens, and a listener bound on attach would miss one that was already up.
	$effect(() => trackKeyboardInset());

	// Where the audio is, pushed into the anchor gutter — which fills one dot and
	// is the entire extent of what playback is permitted to do to the document.
	// It is deliberately not conditional on playing: a paused track still has a
	// position, and showing it is how the user finds their way back to it.
	$effect(() => {
		const player = controller.media?.player;
		editorHandle?.setMediaPlayhead?.(player?.attached ? player.currentTime : undefined);
		anchors = editorHandle?.getLineAnchors?.() ?? [];
	});

	// The timed lines are what the side keys step between. The transport owns the
	// arithmetic, as it owns every other rule about where the playhead lands; all
	// it is told here is the moments, so a press from the strip and a press of the
	// key cannot disagree about what "back" means.
	$effect(() => {
		controller.media?.player.setCuePoints(anchors.map((anchor) => anchor.time));
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
			<MediaStrip media={controller.media} sync={lyricSync} follow={followControl} />
		{/if}
	</section>

	<!--
		Stacked, the status bar is handed to the panel rather than kept as the
		grid's last row. It is the window's summary and belongs on the floor of the
		window — but at this size that floor is a band taken off a list that is
		already too short, and the row holds the only way to attach audio, so it
		cannot simply be dropped. Inside the panel's scroll port it is the last
		thing under the player, reached by scrolling to the bottom of whichever tab
		is open. One element either way: rendering it twice would put a second
		`Add audio` dialog and a second copy of every count in the document.

		`stacked` is the same breakpoint as the `68rem` block in responsive.css and
		has to be changed with it. Its fallback is false, so a server render — which
		has no viewport to ask — emits the grid row, which is where the CSS still
		puts it until the query resolves.
	-->
	<RightPanel {controller} footer={stacked.current ? statusBar : undefined} />

	{#if !stacked.current}
		{@render statusBar()}
	{/if}
</main>

{#snippet statusBar()}
	<footer class="status-bar" aria-label="Document summary">
		<span class="status-bar__group">
			<!-- The way in to the audio, in the row the transport itself appears
			     directly above. It is a control among readouts, so unlike the counts
			     it does not wait for something to report — a stable slot with a
			     label that follows the state is what makes it findable at all. -->
			{#if controller.media}
				<!-- The title rides along so the picker can offer a search for the song
				     this draft is already named after, rather than only for one that
				     has been attached. -->
				<MediaPicker media={controller.media} draftTitle={controller.title} />
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
{/snippet}
