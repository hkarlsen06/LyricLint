<script lang="ts">
	import type {
		EditorHandle,
		EditorSnapshot,
		LineAnchor,
		UnknownVoiceRequest
	} from '$lib/core/types.js';
	import type {
		EditorDisplayContext,
		EditorPaneProps,
		LyricEditorCallbacks
	} from '$lib/editor/index.js';
	import {
		assignUnknownVoice,
		assignVoiceGroup,
		assignVoiceLegend,
		insertSectionHeader
	} from '$lib/performers/index.js';
	import {
		getLanguagePack,
		linkableSemantic,
		resolveLanguageTag
	} from '$lib/languages/registry.js';
	import { lineNumberAt } from '$lib/core/line-numbers.js';
	import { unknownVoiceAcceptanceKey } from '$lib/diagnostics/ignore.js';
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import { loadStatisticalLanguageDetector } from '$lib/languages/detect.js';
	import {
		createHarperDiagnosticProvider,
		mergeHarperDiagnostics,
		type HarperDiagnosticProvider
	} from '$lib/rules/index.js';
	import { resolve } from '$app/paths';
	import { useAssistantState } from '$lib/assistant/assistant.svelte.js';
	import type { AssistantDraftBridge } from '$lib/assistant/draft-bridge.js';
	import { onDestroy, type Component, untrack } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import {
		buildRuleContext,
		computeDiagnostics,
		filterForEditorState,
		everyLyricLineTimed,
		isTypingChange,
		selectionCoversLyricLine,
		timedLinesSkippable,
		resolveVoiceGroupRanges
	} from '../state/wiring.js';
	import ControlTooltip from '../primitives/ControlTooltip.svelte';
	import DocumentToolbar from './DocumentToolbar.svelte';
	import EditorActions from './EditorActions.svelte';
	import MediaPicker from '../media/MediaPicker.svelte';
	import MediaStrip from '../media/MediaStrip.svelte';
	import { bindTransportShortcuts } from '../state/media-shortcuts.js';
	import { carryHarperDiagnosticsAcrossEdit } from '../state/harper-continuity.js';
	import { trackKeyboardInset } from '../state/keyboard-inset.js';
	import { STACKED_BREAKPOINT } from '../state/phone-layout.js';
	import RightPanel from './RightPanel.svelte';

	let {
		controller,
		editorComponent,
		harperProvider = createHarperDiagnosticProvider(),
		brandRevealed = true
	}: {
		controller: WorkbenchController;
		editorComponent: Component<EditorPaneProps>;
		/** Injectable so component tests never need to instantiate the WASM worker. */
		harperProvider?: HarperDiagnosticProvider;
		/** Delays the toolbar lockup until the boot screen has finished leaving. */
		brandRevealed?: boolean;
	} = $props();

	let editorHandle = $state<EditorHandle>(untrack(() => controller.editor));
	let mediaPicker = $state<{ open(source?: HTMLButtonElement): Promise<void> }>();
	const EditorComponent = $derived(editorComponent);

	function openMediaPicker(source: HTMLButtonElement): void {
		void mediaPicker?.open(source);
	}

	// Undefined in a workspace rendered on its own, which is how every component
	// test renders it — the control simply does not draw there.
	const assistant = useAssistantState();

	// The assistant store outlives this workspace and deliberately knows nothing
	// about the editor. This bridge reads the controller's current handle at call
	// time, so a keyed editor remount cannot leave it pointing at the editor that
	// was just destroyed. Tracking the draft id re-registers the seam when the
	// open draft changes, which also reloads that draft's stored access decision.
	$effect(() => {
		if (!assistant) return;
		const draftId = controller.draftId;
		const bridge: AssistantDraftBridge = {
			draftId: () => draftId,
			readText: () => controller.snapshot.text,
			revision: () => controller.snapshot.revision,
			preview(edit) {
				if (edit.baseRevision !== controller.snapshot.revision) return false;
				const editor = controller.editor;
				if (!editor.previewAtomic) return false;
				try {
					editor.previewAtomic(edit);
					return true;
				} catch {
					return false;
				}
			},
			clearPreview() {
				controller.editor.clearPreview?.();
			},
			reveal(range) {
				// The same two moves `revealDiagnostic` makes, in the same order.
				// The selection is what draws the full-width active-line wash, so
				// a scroll on its own puts the diff on screen without saying which
				// line it is in; and the reveal has to come last, because
				// CodeMirror applies queued scrolls in its measure phase and the
				// selection's own nearest-edge nudge would otherwise replace the
				// deliberate upper-third placement. Neither call focuses: a wash
				// with no caret in it reads as a location, which is what this is.
				//
				// Both assert the span against the live document, so a draft
				// edited between resolving the anchor and the hover throws rather
				// than moving. A preview the user cannot see beats a pointer
				// crossing a card and raising.
				const editor = controller.editor;
				try {
					editor.setSelection({ anchor: range.from, head: range.to });
					editor.revealRange(range);
				} catch {
					/* the span no longer exists */
				}
			},
			apply(edit, options) {
				const editor = controller.editor;
				try {
					editor.clearPreview?.();
					if (edit.baseRevision !== controller.snapshot.revision) return false;
					if (options?.applyTo === 'this_section_only') {
						if (!editor.dispatchAtomicOnlyHere) return false;
						editor.dispatchAtomicOnlyHere(edit, options.range);
					} else {
						editor.dispatchAtomic(edit);
					}
					return true;
				} catch {
					return false;
				}
			},
			sectionLinks() {
				return controller.sectionLinks.map((group) => ({ lines: [...group.lines] }));
			},
			linkableSections(headerLines) {
				const snapshot = controller.snapshot;
				const pack = getLanguagePack(controller.language);
				const semantics = headerLines.map((line) => {
					const section = snapshot.parsed.sections.find(
						(candidate) =>
							candidate.header && lineNumberAt(snapshot.text, candidate.header.from) === line
					);
					return linkableSemantic(pack, section?.header?.rawNamePart);
				});
				return (
					semantics.length > 0 &&
					semantics.every((semantic) => semantic !== undefined && semantic === semantics[0])
				);
			},
			linkSections(headerLines) {
				const editor = controller.editor;
				if (!editor.linkSections || !bridge.linkableSections(headerLines)) return false;
				const snapshot = controller.snapshot;
				const headers: number[] = [];
				for (const line of headerLines) {
					const from = snapshot.parsed.sections.find(
						(section) => section.header && lineNumberAt(snapshot.text, section.header.from) === line
					)?.header?.from;
					if (from === undefined) return false;
					headers.push(from);
				}
				try {
					// Every difference stays deliberate. Nothing names `replaceFrom`, so
					// this is the same non-destructive choice the picker opens on.
					editor.linkSections({
						headers,
						keepDifferent: (editor.getLinkDifferences?.(headers) ?? []).map(() => true)
					});
					return true;
				} catch {
					return false;
				}
			},
			unlinkSection(headerLine) {
				const editor = controller.editor;
				if (!editor.linkSections) return false;
				const group = bridge
					.sectionLinks()
					.find((candidate) => candidate.lines.includes(headerLine));
				if (!group) return false;
				const snapshot = controller.snapshot;
				const headers: number[] = [];
				for (const line of group.lines) {
					const from = snapshot.parsed.sections.find(
						(section) => section.header && lineNumberAt(snapshot.text, section.header.from) === line
					)?.header?.from;
					if (from === undefined) return false;
					headers.push(from);
				}
				try {
					// The picker's unlink path names one member. Repeating that path
					// through all but the last member dissolves a group of any size;
					// once only one survives, the field drops it by invariant.
					for (const header of headers.slice(0, -1)) {
						editor.linkSections({ headers: [header] });
					}
					return true;
				} catch {
					return false;
				}
			}
		};
		return assistant.registerDraftBridge(bridge);
	});

	/** The stacked layout, in step with the matching block in responsive.css. */
	const stacked = new MediaQuery(`(max-width: ${STACKED_BREAKPOINT})`);

	const reducedMotion = prefersReducedMotion();

	// Local on purpose: the codebase has no shared pluralizer, and the status
	// bar is UI chrome (always English), not lyric text, so the language packs
	// under $lib/languages do not apply.
	function count(value: number, noun: string): string {
		return `${value} ${noun}${value === 1 ? '' : 's'}`;
	}

	// Read-only presentation stats for the status bar; derived from the snapshot
	// the controller already holds, never written back. `section.lines` holds
	// only sung text — the parser keeps blank lines and bracket-shaped lines
	// out of it — so the count is of lyric lines, not of the document's rows.
	const documentStats = $derived.by(() => {
		const parsed = controller.snapshot.parsed;
		const lines = parsed.sections.reduce((total, section) => total + section.lines.length, 0);
		return {
			lines,
			sections: parsed.sections.length,
			performers: controller.performers.length
		};
	});

	// A count worth stating is one that could have been otherwise. On a fresh
	// document all four are zero, which is four more ways for the window to say
	// "empty" to someone who can already see that it is — so each one waits
	// until it has something to report.
	const documentCounts = $derived(
		[
			documentStats.lines > 0 ? count(documentStats.lines, 'line') : undefined,
			documentStats.sections > 0 ? count(documentStats.sections, 'section') : undefined,
			documentStats.performers > 0 ? count(documentStats.performers, 'performer') : undefined
		].filter((label) => label !== undefined)
	);

	// Run the rule engine for one revision and fold the diagnostics into the
	// snapshot before the controller stores it. Composition revisions reuse the
	// previous result so linting never runs on incomplete IME input.
	let lastDiagnostics: EditorSnapshot['diagnostics'] = [];
	let lastNativeDiagnostics: EditorSnapshot['diagnostics'] = [];
	let lastLintKey = '';
	let harperTimer: ReturnType<typeof setTimeout> | undefined;
	let harperRequest = 0;
	let harperPending = false;
	let harperUnavailable = false;
	// The document Harper has actually answered for — or has nothing to say
	// about, which is the same thing to everyone downstream. See the memoized
	// branch of `enrichSnapshot`, which is where a document can otherwise lose
	// its request and never ask for another.
	let harperCoveredKey: string | undefined;
	let languageDetectorTimer: ReturnType<typeof setTimeout> | undefined;
	let languageDetectorStarted = false;
	let destroyed = false;
	const harperDelay = 250;
	const languageDetectorDelay = 150;

	// Whether the shape of the song is worth an opinion yet. A `document`-tier
	// rule is a claim about the whole transcription, and a transcription being
	// typed is one whose shape is wrong the entire way down — one distinct verse
	// until the second is written, one chorus until the repeat exists. So those
	// findings wait for a pause rather than for a line.
	//
	// Long, and deliberately so: this is not a debounce buying the linter time to
	// think, it is the linter waiting for the user to stop making the answer
	// change. Under a second it fires mid-sentence, which is the noise it exists
	// to remove.
	const settleDelay = 1500;
	let documentSettled = true;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let settledText = '';

	function noteDocumentChange(snapshot: EditorSnapshot): void {
		if (snapshot.text === settledText) return;
		// The editor says outright when a change was one complete edit rather than
		// composition, so a press is never estimated from how much text moved.
		// `isTypingChange` is what is left: the changes nobody dispatched, which is
		// keystrokes, pastes and drops.
		const typing = !snapshot.atomic && isTypingChange(settledText, snapshot.text);
		settledText = snapshot.text;
		if (settleTimer !== undefined) clearTimeout(settleTimer);
		settleTimer = undefined;
		if (!typing) {
			// Text that arrived whole — a draft opened, a paste, the sample, a fix —
			// is a finished document, so its shape findings are right now.
			documentSettled = true;
			return;
		}
		documentSettled = false;
		settleTimer = setTimeout(() => {
			settleTimer = undefined;
			// `documentSettled` cannot be true here — every assignment of it clears
			// this timer first — so `destroyed` is the whole guard.
			if (destroyed) return;
			documentSettled = true;
			// Nothing else emits a snapshot when typing merely stops, so the pause
			// has to re-publish the one in hand. Free, for the reason
			// `republishForSectionLinks` gives: the lint is memoized on the document,
			// so this only re-filters findings already computed.
			publishSnapshot(controller.snapshot);
		}, settleDelay);
	}

	function lintKey(snapshot: EditorSnapshot): string {
		const performerKey = controller.performers
			.map(
				(performer) =>
					`${performer.id}:${performer.normalizedKey}:${performer.aliases.join('\u001f')}`
			)
			.join('\u001e');
		return `${controller.language}\u0000${performerKey}\u0000${snapshot.revision}\u0000${snapshot.text}`;
	}

	// What a Harper answer belongs to: the draft as well as the lint key, because
	// the same words in two drafts are two documents. Written once rather than at
	// each of the three places that compare it.
	function harperCoverage(key: string): string {
		return `${controller.draftId}\u0000${key}`;
	}

	function invalidateHarper(): number {
		harperRequest += 1;
		harperPending = false;
		if (harperTimer !== undefined) {
			clearTimeout(harperTimer);
			harperTimer = undefined;
		}
		return harperRequest;
	}

	function shouldRunHarper(snapshot: EditorSnapshot): boolean {
		return (
			!harperUnavailable &&
			controller.grammarCheckEnabled &&
			resolveLanguageTag(controller.language) === 'en' &&
			snapshot.text.trim().length > 0
		);
	}

	function scheduleHarper(
		snapshot: EditorSnapshot,
		nativeDiagnostics: EditorSnapshot['diagnostics']
	): void {
		const request = invalidateHarper();
		const key = harperCoverage(lintKey(snapshot));
		if (!shouldRunHarper(snapshot)) {
			// Nothing is coming and nothing is owed: this document is as answered as
			// it is ever going to be. Left uncovered, the memoized branch below would
			// ask for it again on every snapshot the document takes.
			harperCoveredKey = key;
			return;
		}

		harperPending = true;
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
						harperCoverage(lintKey(current)) !== key
					) {
						return;
					}

					harperPending = false;
					harperCoveredKey = key;
					const merged = mergeHarperDiagnostics(nativeDiagnostics, harperDiagnostics);
					lastDiagnostics = merged;
					controller.onSnapshot(
						{
							...current,
							diagnostics: filterForEditorState(
								current,
								merged,
								editorHandle?.getSectionLinks?.(),
								{ settled: documentSettled }
							)
						},
						merged
					);
				})
				.catch((error: Error) => {
					if (request !== harperRequest || harperUnavailable) return;
					harperPending = false;
					// A provider that has failed is one nothing more is coming from,
					// here or on any later document, so this key is answered too.
					harperCoveredKey = key;
					harperUnavailable = true;
					console.error('Harper grammar checking is unavailable.', error);
					// A carried result was only a bridge to this answer. If no answer can
					// arrive, retire it instead of leaving a previous revision's opinion
					// in the document indefinitely.
					lastDiagnostics = nativeDiagnostics;
					const current = controller.snapshot;
					controller.onSnapshot(
						{
							...current,
							diagnostics: filterForEditorState(
								current,
								nativeDiagnostics,
								editorHandle?.getSectionLinks?.(),
								{ settled: documentSettled }
							)
						},
						nativeDiagnostics
					);
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
					publishSnapshot(controller.snapshot);
				})
				.catch((error: Error) => console.error('Language recognition is unavailable.', error));
		}, languageDetectorDelay);
	}

	function enrichSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
		noteDocumentChange(snapshot);
		if (!snapshot.composing) {
			const key = lintKey(snapshot);
			if (key === lastLintKey) {
				// A composing snapshot invalidates whatever Harper request was in
				// flight, and a composition that is *cancelled* changes no text — so
				// the snapshot that follows takes this memoized path, which is the one
				// path that never schedules, and Harper stays silent on that document
				// until the next real edit. Nothing on screen says so either: the
				// request is not pending, so the panel reads as complete.
				//
				// The coverage key is what tells "already answered" from "lost its
				// answer": it is only written once a request has actually landed (or
				// there was never one to make), so re-asking here cannot double-merge
				// findings into a list that already holds them.
				if (!harperPending && harperCoveredKey !== harperCoverage(key)) {
					scheduleHarper(snapshot, lastNativeDiagnostics);
				}
				return {
					...snapshot,
					diagnostics: filterForEditorState(
						snapshot,
						lastDiagnostics,
						editorHandle?.getSectionLinks?.(),
						{ settled: documentSettled }
					)
				};
			}
			const context = buildRuleContext(
				controller.language,
				controller.performers,
				controller.ruleSet?.version ?? 'unavailable',
				snapshot.revision
			);
			const nativeDiagnostics = computeDiagnostics(snapshot.parsed, context);
			lastNativeDiagnostics = nativeDiagnostics;
			// A fix is complete the moment this atomic snapshot arrives, but Harper's
			// replacement answer is still behind its debounce and worker pass. Carry
			// only unaffected findings across that known edit so the list does not
			// blink to native-only and back. A republish of an old atomic snapshot is
			// not an edit, hence the text comparison as well as the annotation.
			const carriedHarper =
				snapshot.atomic && snapshot.text !== controller.snapshot.text && shouldRunHarper(snapshot)
					? carryHarperDiagnosticsAcrossEdit(controller.snapshot, snapshot, lastDiagnostics)
					: [];
			lastDiagnostics = mergeHarperDiagnostics(nativeDiagnostics, carriedHarper);
			lastLintKey = key;
			scheduleLanguageDetector(snapshot);
			scheduleHarper(snapshot, nativeDiagnostics);
		} else {
			invalidateHarper();
		}
		return {
			...snapshot,
			diagnostics: filterForEditorState(
				snapshot,
				lastDiagnostics,
				editorHandle?.getSectionLinks?.(),
				{ settled: documentSettled }
			)
		};
	}

	function publishSnapshot(snapshot: EditorSnapshot): void {
		const enriched = enrichSnapshot(snapshot);
		controller.onSnapshot(enriched, harperPending ? null : lastDiagnostics);
	}

	/**
	 * Re-run the suppression over the snapshot already in hand.
	 *
	 * A link made, taken off, or read back out of the draft changes no text, and
	 * an effects-only transaction deliberately emits no snapshot — so nothing
	 * would re-run `filterForEditorState`, which is where an answered
	 * `section.unlinked-repeat` is hidden. It worked by accident until now:
	 * applying the card collapses the selection, and that is a snapshot. Restoring
	 * a draft's links at boot collapses nothing, so a reload came back with the
	 * suggestion still on every linked section and it went away on the first press
	 * in the document — the first selection change that emitted one.
	 *
	 * Costs nothing it did not already cost: the lint is memoized on the document,
	 * so this re-filters the diagnostics that were already computed, and the
	 * snapshot re-adopted is byte for byte the one in hand, so no save is dirtied.
	 */
	function republishForSectionLinks(): void {
		publishSnapshot(controller.snapshot);
	}

	onDestroy(() => {
		destroyed = true;
		if (settleTimer !== undefined) clearTimeout(settleTimer);
		if (languageDetectorTimer !== undefined) clearTimeout(languageDetectorTimer);
		invalidateHarper();
		void harperProvider
			.dispose()
			.catch((error: Error) => console.error('Harper worker cleanup failed.', error));
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
		onSnapshot: publishSnapshot,
		// Assignment happens inline in the floating card; the right panel keeps
		// whatever tab the user chose.
		onAssignRequest: () => {},
		onAddPerformer: (displayName) => controller.addPerformer(displayName),
		onPerformerRenamed: ({ performerId, previousName, displayName }) =>
			controller.adoptHeaderRename(performerId, previousName, displayName),
		onSectionHeaderRequest: () => {},
		// `Ctrl-Alt-U`, and the action bar's own press goes through the controller
		// directly — one implementation either way, because the edit is the
		// session's to dispatch.
		onUnknownMarkerRequest: () => {
			controller.insertUnknownMarker();
			return true;
		},
		// Reported rather than asked: `Mod-F` is bound to the window and the panel
		// closes from `Escape` and from its own control, so the tray's glyph would
		// otherwise burn accent over a bar that had already gone.
		onSearchOpenChange: (open) => controller.noteSearchOpen(open),
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
		createUnknownVoiceEdit: ({ range, styleSlot }) => {
			const snapshot = controller.snapshot;
			const request: UnknownVoiceRequest = {
				revision: snapshot.revision,
				text: snapshot.text,
				document: snapshot.parsed,
				selection: { anchor: range.from, head: range.to }
			};
			if (styleSlot !== undefined) request.styleSlot = styleSlot;
			const result = assignUnknownVoice(request);
			if (result.status === 'applied') {
				// The chip pressed is the answer `The performer is unknown`, so the
				// finding this edit creates arrives already accepted — a card asking
				// the question the picker just answered is the workbench arguing
				// with itself. Written before the edit lands: nothing can settle in
				// between, and the next settled lint matches it to the finding.
				controller.recordAcceptedOccurrence(
					unknownVoiceAcceptanceKey(snapshot.text, range, result.styleSlot)
				);
				return result.edit;
			}
			const reason = (result.blocked ?? result.reason).replaceAll('-', ' ');
			controller.feedback.announce(`Unknown voice assignment blocked: ${reason}.`);
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
		// The sync tap's whole question in one read, taken at the moment of the
		// press for the same reason the time above is `liveTime()`. `playing` is
		// the player's own intent-inclusive answer, so a tap made while a start is
		// still settling counts as a tap the user meant.
		onRequestMediaPlayback: () => {
			const player = controller.media?.player;
			if (!player?.attached) return undefined;
			return { time: player.liveTime(), rate: player.rate, playing: player.playing };
		},
		// The clipboard pair: what a metadata-carrying copy says about this
		// draft's song, and what a pasted fragment's source is worth here. Both
		// are the media store's questions — the editor has no standing in either.
		onRequestMediaSource: () => controller.media?.clipboardSource(),
		onMediaSourcePasted: (source) => {
			void controller.media?.adoptPastedSource(source);
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
		// Unlinking moves no text, so this is the only thing that writes it down —
		// and the only thing that re-asks whether the suggestion it answered is
		// still worth showing.
		onSectionLinksChanged: () => {
			controller.onSectionLinksChanged();
			republishForSectionLinks();
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
		onLyricSyncChange: (active, startAt, scoped) => {
			syncing = active;
			syncScoped = active && (scoped ?? false);
			const player = controller.media?.player;
			if (active) {
				// Wherever the editor put the caret, because a run is one pass over the
				// document against one pass of the audio and the two ends have to begin
				// in the same place. That is 0 for a fresh pass and the resumed line's
				// own time for a half-timed song; the editor decides which, because the
				// anchors are the editor's. An absent `startAt` is the editor saying
				// the tape must be left where the user parked it — a selection-scoped
				// run with no timed line above the selection — so seeking anywhere,
				// 0 included, would destroy the one position somebody chose.
				if (startAt !== undefined) player?.seek(startAt);
				player?.play();
				// The tap is a keystroke, so the run cannot start with focus in the
				// button that started it. This is a deliberate focus move into a mode
				// the user just asked for, not the editor grabbing the caret — and it
				// is deferred a frame, because this hook fires synchronously inside
				// the press that turned the mode on: the click's own default
				// processing and the re-render the state flip schedules both run
				// after a synchronous call, and either can take the focus straight
				// back. Left synchronous, a run started with focus on the scrubber —
				// which is where a scoped run's own design just had the user parking
				// the tape — came up with the space bar answering nothing. One frame
				// later the press has fully played out and nothing contests it.
				requestAnimationFrame(() => {
					if (syncing) editorHandle?.focus();
				});
			} else {
				player?.pause();
			}
		},
		// A toast and nothing else. The editor has already announced the same
		// sentence — it owns the run and the message is its own — so announcing here
		// as well would read it into the live region twice for one event.
		onLyricSyncNotice: (message) => void controller.feedback.addToast({ message })
	};

	let syncing = $state(false);
	// Whether the active run covers a selection rather than the song — reported
	// by the editor with the mode itself, because the editor owns the scope.
	let syncScoped = $state(false);
	let following = $state(true);
	let anchors = $state<readonly LineAnchor[]>([]);
	let syncOwner: EditorHandle | undefined;
	const anchorCount = $derived(anchors.length);

	// Two anchor lists that say the same thing about the same lines. An anchor is
	// a line and a time and nothing else, so this is the whole of the comparison.
	function sameAnchors(current: readonly LineAnchor[], next: readonly LineAnchor[]): boolean {
		return (
			current.length === next.length &&
			current.every((anchor, index) => {
				const other = next[index]!;
				return anchor.line === other.line && anchor.time === other.time;
			})
		);
	}

	// Read off the snapshot rather than asked for through the handle: the anchors
	// carry their own line numbers and the text is already here.
	const allLinesTimed = $derived(everyLyricLineTimed(controller.snapshot.text, anchors));

	// Whether a run standing here has timed lines to skip past — a song synced
	// once and then split into more lines is timed everywhere except the new
	// ones, and re-listening through verses that are already right is the wait
	// the skip control exists to remove. Off the snapshot for the same reason as
	// `allLinesTimed`, plus the selection: a tap moves the caret and writes an
	// anchor, and both arrive here as state this derivation already reads.
	const skippableAhead = $derived(
		timedLinesSkippable(controller.snapshot.text, anchors, controller.snapshot.selection.head)
	);

	// Whether a press on the sync control would scope the run to the selection —
	// the same question the editor's own `selectionScope` answers on entry, off
	// the snapshot the shell already holds, so the strip's label can say what the
	// press will do before it is made.
	const selectionSyncable = $derived(
		selectionCoversLyricLine(controller.snapshot.text, controller.snapshot.selection)
	);

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
		get scopesSelection() {
			return selectionSyncable;
		},
		get canSkip() {
			// A scoped run hides the skip rather than capping it: the jump is
			// measured against the whole document, and inside a selection's few
			// lines it would be a control that mostly refuses.
			return skippableAhead && !syncScoped;
		},
		toggle: () => editorHandle?.setLyricSync?.(!syncing),
		tap: () => editorHandle?.tapLyricSync?.(),
		skip: () => editorHandle?.skipLyricSync?.()
	};

	// A handle arriving is the only thing this pass answers to, so the hand-off
	// itself runs untracked: it reads back what it has just written — the editor's
	// own anchors and links — and an editor that holds those in reactive state (the
	// mock does; CodeMirror does not) would otherwise re-enter this effect forever.
	$effect(() => {
		const handle = editorHandle;
		untrack(() => {
			// Sync mode belongs to one editor instance. A draft switch replaces that
			// editor, but the shell survives the keyed remount; carrying its `syncing`
			// mirror across made the fresh editor draw `Stop syncing` while its own mode
			// was already off. Pressing the control then asked that editor to turn off
			// again, produced no change callback, and left the shell stuck forever.
			//
			// Treat an editor hand-off as the end of the old run. This also covers an
			// HMR/remount without coupling the rule to draft navigation specifically.
			if (handle !== syncOwner) {
				syncOwner = handle;
				if (syncing) controller.media?.player.pause();
				syncing = false;
				syncScoped = false;
			}
			controller.setEditorHandle(handle);
			// Read the anchors back on the same pass, because that call is where a
			// remount gets the draft's own timings re-seated onto it — through
			// `setLineAnchors`, which deliberately reports nothing (it is the draft being
			// read back, not changed). Without this the shell's copy stays as it was left
			// by whichever editor is being replaced, and with a paused track nothing else
			// re-reads it: a fully timed song comes back from a draft switch still
			// offering `Sync lyrics`, and the follow control still hidden.
			anchors = handle?.getLineAnchors?.() ?? [];
			// The same call re-seats the draft's links, and unlike the anchors those
			// decide what the linter shows.
			republishForSectionLinks();
		});
	});

	// Re-lint when grammar checking is switched on or off. Toggling the preference
	// changes no text, so nothing else republishes — this is the same explicit
	// re-adoption `republishForSectionLinks` exists for. Clearing `lastLintKey`
	// makes the native pass recompute and `scheduleHarper` run again; when the
	// preference is off that call early-returns, so the merged Harper findings drop
	// on the way past. The first run only records the value the controller booted
	// with (the async preference load may flip it a tick later, which re-runs this).
	let appliedGrammarCheck: boolean | undefined;
	$effect(() => {
		const enabled = controller.grammarCheckEnabled;
		if (appliedGrammarCheck === enabled) return;
		const first = appliedGrammarCheck === undefined;
		appliedGrammarCheck = enabled;
		if (first) return;
		lastLintKey = '';
		publishSnapshot(controller.snapshot);
	});

	// The transport keys, bound to the window and not to the document. The pause
	// is wanted most at exactly the moments the caret has left the text — reading
	// a finding, aiming a scrubber, renaming the draft — so a binding that only
	// answered inside the editor answered in the wrong half of the loop.
	//
	// Attachment and a remembered-but-unloaded source are the only reactive media
	// values read here, so the listener follows attach, detach, and a pending
	// source arriving or being spent — a handful of transitions, not every
	// playhead tick. It binds while there is anything to control *or* anything to
	// load: a bare Escape brings a remembered song that is waiting on a gesture.
	$effect(() => {
		const media = controller.media;
		const player = media?.player;
		if (!player?.attached && media?.pendingName === undefined) return;
		return bindTransportShortcuts({
			transport: (action) => {
				if (!player?.attached) return false;
				player.transport(action);
				return true;
			},
			// The tape is remembered but not here yet, and a bare Escape is what the
			// strip's `Load …` control makes — so the reach-for key makes it too.
			// Nothing to load while something is attached or a load is in flight.
			load: () => {
				if (!media || media.player.attached || media.pendingName === undefined || media.busy) {
					return false;
				}
				void media.reconnect();
				return true;
			},
			// While a run is under way, a bare space is the tap wherever it lands —
			// short of a surface that types or presses with it. Without this, the
			// space bar paused the tape the moment focus left the editor, which is
			// exactly where a scoped run's own design sends it: to the scrubber, to
			// park the tape. Read here rather than rebinding on run changes, because
			// the callbacks close over the live state.
			tap: () => {
				if (!syncing) return false;
				editorHandle?.tapLyricSync?.();
				return true;
			},
			play: () => {
				if (!player?.attached) return false;
				player.play();
				return true;
			},
			pause: () => {
				if (!player?.attached) return false;
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
	// position, and showing it is how the user finds their way back to it. But
	// whether the tape is running rides along, because a pause that lasts lets
	// the editor rest the wash across the marked line's text — the line number
	// and timestamp keep the color, which is that way back.
	//
	// The anchors are read on the same pass and deliberately so: an edit that
	// shifts a timed line arrives as a document change, which `onAnchorsChanged`
	// stays quiet for, so this tick is what re-reads them. What it must not do is
	// *assign* them every time — the playhead arrives several times a second, and
	// a fresh array identity per tick re-ran `everyLyricLineTimed` (a walk of the
	// whole text), the skip predicate, and the cue-point push over a list that had
	// not changed since the last tap. Same lines at the same times, same array.
	$effect(() => {
		const player = controller.media?.player;
		editorHandle?.setMediaPlayhead?.(
			player?.attached ? player.currentTime : undefined,
			player?.playing ?? false
		);
		const next = editorHandle?.getLineAnchors?.() ?? [];
		// Untracked, because the comparison reads the very state it may write:
		// tracked, the effect would depend on its own assignment.
		untrack(() => {
			if (!sameAnchors(anchors, next)) anchors = next;
		});
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
		publishSnapshot(current);
	});
</script>

<main class="workspace" data-testid="workspace">
	<h1 class="sr-only">LyricLint transcription workbench</h1>

	<!-- The toolbar spans both columns: the draft's name, its save state, and the
	     commands that act on the whole document belong to the window, not to the
	     editor half of it. The panel's tabs then hang directly under it. -->
	<DocumentToolbar {controller} {brandRevealed} />

	<section class="editor-region" aria-label="Lyrics workspace">
		<!-- Level with the panel's tab strip, so the two read as one band under the
		     toolbar: the editor's commands at the left of the window, the panel's
		     tabs at the right. -->
		<EditorActions {controller} />

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

		`stacked` is the same breakpoint as the documented block in responsive.css and
		has to be changed with it. Its fallback is false, so a server render — which
		has no viewport to ask — emits the grid row, which is where the CSS still
		puts it until the query resolves.
	-->
	<RightPanel
		{controller}
		{assistant}
		openMediaPicker={controller.media ? openMediaPicker : undefined}
		footer={stacked.current ? statusBar : undefined}
	/>

	{#if !stacked.current}
		{@render statusBar()}
	{/if}
</main>

<!-- One box for every control that names itself, filled by whichever one the
     pointer or the keyboard is on. It is here rather than in the app layout so
     that a workspace rendered on its own — which is how every component test
     renders it — still has somewhere to draw. -->
<ControlTooltip />

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
				<MediaPicker
					bind:this={mediaPicker}
					media={controller.media}
					draftTitle={controller.title}
				/>
			{/if}
			{#if documentCounts.length > 0}
				<span>{documentCounts.join(' · ')}</span>
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
