<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type {
		Diagnostic,
		DiagnosticFix,
		EditorSnapshot,
		LanguagePack,
		PerformerId,
		StyleSlot,
		TextRange
	} from '$lib/core/types.js';
	import {
		resolveLegendAssignment,
		type LegendAssignmentResolution
	} from '$lib/performers/legend-assignment.js';
	import type { CreateLyricEditorOptions, LyricEditorInstance } from './create-editor.js';
	import type {
		EditorPaneProps,
		LyricEditorCallbacks,
		ScreenRect,
		SectionHeaderChoice,
		SelectionAnchor
	} from './contracts.js';
	import {
		activateDiagnostic,
		anchorPlacement,
		applyPerformerPicker,
		beginLegendAssignment,
		cachedAnchorRect,
		cancelPerformerPicker,
		closeOverlay,
		closedOverlaySession,
		dismissDiagnostic,
		finishPerformerAssignment,
		forgetDismissedSelection,
		openPerformerPicker,
		openSectionPicker,
		overlayRange,
		releaseUnanchoredDiagnostic,
		reportSelectionAnchor,
		type LegendTarget,
		type OverlaySession
	} from './overlay-state.js';
	import DiagnosticPopover from './overlays/DiagnosticPopover.svelte';
	import PerformerPicker from './overlays/PerformerPicker.svelte';
	import SectionPicker from './overlays/SectionPicker.svelte';
	import type { SectionHeaderNeighbors } from './overlays/section-picker.js';

	let {
		initialText,
		initialSelection,
		initialRevision = 0,
		context,
		callbacks,
		handle = $bindable(),
		onready,
		ondestroyed
	}: EditorPaneProps = $props();
	let host: HTMLDivElement;
	let editor = $state.raw<LyricEditorInstance | undefined>();
	let selectionAnchor = $state<SelectionAnchor | undefined>();
	// Every overlay this pane can show lives in one discriminated value, so the
	// legal combinations are the variants themselves rather than an unwritten
	// agreement between separate flags. All transitions live in overlay-state.ts.
	let session = $state<OverlaySession>(closedOverlaySession());
	let lastRevision = untrack(() => initialRevision);
	// Bumped on editor scroll so anchored overlays recompute their coordinates
	// and stay attached to their line instead of floating in the viewport.
	let scrollTick = $state(0);
	// The scroll position (tick) at which the cached selection anchor rect was
	// captured; after scrolling, the rect must be recomputed from the document.
	let selectionAnchorTick = 0;

	const overlay = $derived(session.overlay);
	// One anchor per pane: the open overlay names its range, and the cache
	// invariant is applied once here instead of per overlay in the markup.
	const anchorRange = $derived(overlayRange(overlay));
	const overlayAnchor = $derived(anchorRange ? anchorRect(anchorRange) : undefined);
	const overlayPlacement = $derived(
		anchorRange ? anchorPlacement(selectionAnchor, anchorRange) : 'above'
	);

	// The variants are projected here rather than narrowed with `{@const}` in the
	// branches: a derived that belongs to the component outlives the block effect
	// the overlay's own callbacks fire from.
	const performerOverlay = $derived(overlay.kind === 'performer' ? overlay : undefined);
	const sectionOverlay = $derived(overlay.kind === 'section' ? overlay : undefined);
	const diagnosticOverlay = $derived(overlay.kind === 'diagnostic' ? overlay : undefined);
	const legend = $derived(performerOverlay?.legend);
	// The step counter belongs to the two-voice flow only. A styled-only section
	// names one voice, and the prompt says up front that its markup goes with the
	// assignment — the picker is where that consequence is agreed to.
	const legendPrompt = $derived(
		legend
			? legend.promoteToPlain
				? 'Section voice · formatting removed'
				: legend.step === 'section'
					? 'General section voice · 1 of 2'
					: 'Styled passage · 2 of 2'
			: undefined
	);

	const fallbackLanguagePack = $derived<LanguagePack>(
		context.languagePack ?? {
			tag: context.language,
			displayName: context.language,
			policy: 'unreviewed',
			headers: [],
			sourceIds: [],
			reviewed: false
		}
	);

	function performerIdsForRange(range: TextRange): PerformerId[] {
		const performerIds: PerformerId[] = [];
		for (const voiceRange of context.voiceGroups ?? []) {
			if (voiceRange.legend || voiceRange.from >= range.to || range.from >= voiceRange.to) {
				continue;
			}
			for (const performerId of voiceRange.group.performerIds) {
				if (!performerIds.includes(performerId)) {
					performerIds.push(performerId);
				}
			}
		}
		return context.performers
			.filter((performer) => performerIds.includes(performer.id))
			.map((performer) => performer.id);
	}

	function canRemoveFormattingForRange(range: TextRange): boolean {
		return (context.voiceGroups ?? []).some(
			(voiceRange) =>
				!voiceRange.legend &&
				voiceRange.group.styleSlot !== 1 &&
				voiceRange.from < range.to &&
				range.from < voiceRange.to
		);
	}

	function rectForRange(range: TextRange): ScreenRect {
		const start = editor?.view.coordsAtPos(range.from, 1);
		const end = editor?.view.coordsAtPos(range.to, -1);
		const fallback = host.getBoundingClientRect();
		const left = Math.min(start?.left ?? fallback.left + 12, end?.left ?? fallback.left + 12);
		const top = Math.min(start?.top ?? fallback.top + 12, end?.top ?? fallback.top + 12);
		const right = Math.max(start?.right ?? left, end?.right ?? left);
		const bottom = Math.max(start?.bottom ?? top, end?.bottom ?? top);
		return {
			left,
			top,
			right,
			bottom,
			width: Math.max(0, right - left),
			height: Math.max(0, bottom - top)
		};
	}

	function anchorRect(range: TextRange): ScreenRect {
		// Depend on scrollTick: scrolling must recompute every anchored overlay.
		const tick = scrollTick;
		return (
			cachedAnchorRect(selectionAnchor, range, tick, selectionAnchorTick) ?? rectForRange(range)
		);
	}

	function performerIdsForSlot(sectionFrom: number, styleSlot: StyleSlot): PerformerId[] {
		const section = editor?.handle
			.getSnapshot()
			.parsed.sections.find((candidate) => candidate.from === sectionFrom);
		const header = section?.header;
		if (!header) {
			return [];
		}
		const group = (context.voiceGroups ?? []).find(
			(candidate) =>
				candidate.legend &&
				candidate.group.styleSlot === styleSlot &&
				header.from <= candidate.from &&
				candidate.to <= header.to
		);
		return group ? [...group.group.performerIds] : [];
	}

	function legendResolution(diagnostic: Diagnostic): LegendAssignmentResolution {
		const parsed = editor?.handle.getSnapshot().parsed;
		return parsed
			? resolveLegendAssignment(parsed, diagnostic)
			: { status: 'unavailable', reason: 'not-applicable' };
	}

	function legendTarget(diagnostic: Diagnostic): LegendTarget | undefined {
		const resolution = legendResolution(diagnostic);
		return resolution.status === 'available' ? resolution.target : undefined;
	}

	// The same action the linter panel's card offers for a headerless section,
	// reached from the popover instead: the picker opens over the section the
	// diagnostic named, replacing the card that asked for it.
	function startHeaderChoice(diagnostic: Diagnostic): void {
		internalCallbacks().onSectionHeaderRequest({
			range: { from: diagnostic.from, to: diagnostic.to },
			prefer: 'above'
		});
	}

	function startLegendAssignment(diagnostic: Diagnostic): void {
		const resolution = legendResolution(diagnostic);
		// Both surfaces hide the action when it cannot run, so this is the race:
		// the document changed between the card rendering and the click.
		if (resolution.status === 'unavailable') {
			callbacks.onAnnouncement(
				resolution.reason === 'no-header'
					? 'This section needs a header before its performers can be assigned here.'
					: resolution.reason === 'needs-plain-lyrics'
						? 'This section needs plain lyrics before a second styled voice can be assigned here.'
						: 'This styled passage no longer needs a performer assignment.'
			);
			return;
		}
		const target = resolution.target;
		session = beginLegendAssignment(
			session,
			{ from: diagnostic.from, to: diagnostic.to },
			{
				...target,
				// Nothing to differentiate from means nothing to ask first: the one
				// voice is chosen in a single step.
				step: target.promoteToPlain ? 'styled' : 'section',
				sectionPerformerIds: target.promoteToPlain
					? []
					: performerIdsForSlot(target.sectionFrom, 1),
				styledPerformerIds: performerIdsForSlot(target.sectionFrom, target.styleSlot)
			}
		);
	}

	function internalCallbacks(): LyricEditorCallbacks {
		return {
			...callbacks,
			onSnapshot(snapshot: EditorSnapshot) {
				if (snapshot.revision !== lastRevision) {
					lastRevision = snapshot.revision;
					session = forgetDismissedSelection(session);
				}
				callbacks.onSnapshot(snapshot);
			},
			onAssignRequest(request) {
				session = openPerformerPicker(session, request.range);
				callbacks.onAssignRequest(request);
			},
			onSectionHeaderRequest(request) {
				session = openSectionPicker(session, request.range);
				callbacks.onSectionHeaderRequest(request);
			},
			// Every caller of this one is a pointer: the hovered underline and the
			// cluster badge. It shows the card where the text already is; the shell
			// only gets to mark the matching entry, never to travel to it.
			onDiagnosticActivate(diagnostic) {
				session = activateDiagnostic(session, diagnostic, false);
				callbacks.onDiagnosticHighlight?.(diagnostic);
			},
			onDiagnosticActivateIntent(diagnostic) {
				session = activateDiagnostic(session, diagnostic, true);
				callbacks.onDiagnosticActivate(diagnostic);
			},
			onDiagnosticDismiss() {
				const dismissal = dismissDiagnostic(session);
				session = dismissal.session;
				return dismissal.dismissed;
			}
		};
	}

	function returnFocus(): void {
		editor?.handle.focus();
	}

	function bumpScrollTick(): void {
		scrollTick += 1;
	}

	// Scrolling retires a hovered diagnostic. The card was opened by pointing at
	// a line, and scrolling moves that line out from under the pointer, so the
	// card would describe text the user is no longer indicating. Keyboard-opened
	// popovers hold focus and scroll along with their own reveal, so they stay.
	$effect(() => {
		if (scrollTick === 0) {
			return;
		}
		untrack(() => {
			const current = session.overlay;
			// The popover's own teardown cancels the fix preview it opened.
			if (current.kind === 'diagnostic' && !current.takesFocus) {
				session = closeOverlay(session);
			}
		});
	});

	// Once the diagnostic's line leaves the rendered viewport there is nothing
	// meaningful to anchor to, so the popover closes rather than floating free.
	$effect(() => {
		void scrollTick;
		const current = session.overlay;
		const view = editor?.view;
		if (current.kind !== 'diagnostic' || !view) {
			return;
		}
		const position = Math.min(current.diagnostic.from, view.state.doc.length);
		if (view.coordsAtPos(position, 1) === null) {
			const released = releaseUnanchoredDiagnostic(session);
			session = released.session;
			if (released.returnFocus) {
				returnFocus();
			}
		}
	});

	function cancelPerformer(): void {
		session = cancelPerformerPicker(session);
	}

	async function applyPerformers(performerIds: PerformerId[]): Promise<void> {
		const outcome = applyPerformerPicker(session, performerIds);
		if (outcome.kind === 'none') {
			return;
		}
		// Step one of the legend flow only records the section voice; the picker
		// stays mounted and re-keys itself for the styled passage.
		if (outcome.kind === 'advance') {
			session = outcome.session;
			return;
		}
		try {
			const edit =
				outcome.kind === 'legend'
					? await callbacks.createPerformerLegendEdit?.({
							sectionFrom: outcome.sectionFrom,
							assignments: outcome.assignments,
							unwrapSlots: outcome.unwrapSlots
						})
					: await callbacks.createPerformerEdit?.({ range: outcome.range, performerIds });
			if (edit) {
				editor?.handle.dispatchAtomic(edit);
			}
		} catch (error) {
			callbacks.onAnnouncement(
				error instanceof Error
					? error.message
					: outcome.kind === 'legend'
						? 'The section performers could not be assigned.'
						: 'The performer assignment could not be applied.'
			);
		}
		session = finishPerformerAssignment(session, outcome);
	}

	function existingHeaders(): string[] {
		return (
			editor?.handle
				.getSnapshot()
				.parsed.sections.flatMap((section) =>
					section.header ? [section.header.rawNamePart] : []
				) ?? []
		);
	}

	function sectionHeaderNeighbors(range: TextRange): SectionHeaderNeighbors {
		const sections = editor?.handle.getSnapshot().parsed.sections ?? [];
		const targetIndex = sections.findIndex(
			(section) =>
				(section.from <= range.from && range.from < section.to) ||
				section.lines.some((line) => line.from === range.from)
		);
		if (targetIndex < 0) {
			return {};
		}

		const headersBefore = sections
			.slice(0, targetIndex)
			.flatMap((section) => (section.header ? [section.header.rawNamePart] : []));
		let previousHeader: string | undefined;
		for (let index = targetIndex - 1; index >= 0; index -= 1) {
			const header = sections[index]?.header;
			if (header) {
				previousHeader = header.rawNamePart;
				break;
			}
		}

		let nextHeader: string | undefined;
		for (let index = targetIndex + 1; index < sections.length; index += 1) {
			const header = sections[index]?.header;
			if (header) {
				nextHeader = header.rawNamePart;
				break;
			}
		}

		return { previousHeader, nextHeader, headersBefore };
	}

	async function chooseSection(choice: SectionHeaderChoice): Promise<void> {
		try {
			const edit = await callbacks.createSectionHeaderEdit?.(choice);
			if (edit) {
				editor?.handle.dispatchAtomic(edit);
			}
		} catch (error) {
			callbacks.onAnnouncement(
				error instanceof Error ? error.message : 'The section header could not be inserted.'
			);
		}
		session = closeOverlay(session);
	}

	/**
	 * Apply every occurrence of this exact fix. Only the shell can do it — the
	 * batch has to be the one the linter panel would apply — so unlike `applyFix`
	 * there is no local fallback: without the handler the popover never offers
	 * the control in the first place.
	 */
	function applyFixBatch(fix: DiagnosticFix): void {
		const current = session.overlay;
		if (current.kind !== 'diagnostic') {
			return;
		}
		callbacks.onApplyDiagnosticFixBatch?.(current.diagnostic, fix);
		session = closeOverlay(session);
		if (current.takesFocus) {
			returnFocus();
		}
	}

	function applyFix(fix: DiagnosticFix): void {
		const current = session.overlay;
		if (current.kind !== 'diagnostic') {
			return;
		}
		if (callbacks.onApplyDiagnosticFix) {
			callbacks.onApplyDiagnosticFix(current.diagnostic, fix);
		} else if (fix.kind === 'safe') {
			try {
				editor?.handle.dispatchAtomic(fix.edit);
			} catch (error) {
				callbacks.onAnnouncement(
					error instanceof Error ? error.message : 'The diagnostic fix could not be applied.'
				);
			}
		} else {
			callbacks.onAnnouncement('Preview fixes require the application review handler.');
		}
		session = closeOverlay(session);
		// Same rule as dismissal: only a popover that held focus hands it back.
		// Applying the fix moves the selection onto whatever finding the panel
		// leads with next, so pulling the caret into the editor after a pointer
		// press would arm the user's next keystroke over text they never chose.
		if (current.takesFocus) {
			returnFocus();
		}
	}

	function previewFix(fix: DiagnosticFix): void {
		try {
			// Nothing is revealed or announced: the popover is anchored to the
			// range it previews, so the diff is already on screen, and it appears
			// as a consequence of selecting the diagnostic rather than of a
			// command the user issued.
			editor?.handle.previewAtomic?.(fix.edit);
		} catch (error) {
			callbacks.onAnnouncement(
				error instanceof Error ? error.message : 'The fix could not be previewed in the editor.'
			);
		}
	}

	function clearFixPreview(): void {
		editor?.handle.clearPreview?.();
	}

	function ignoreDiagnostic(): void {
		const current = session.overlay;
		if (current.kind === 'diagnostic') {
			callbacks.onIgnoreDiagnostic?.(current.diagnostic);
		}
		session = closeOverlay(session);
		returnFocus();
	}

	function setLanguage(language: string): void {
		callbacks.onSetLanguage?.(language);
		session = closeOverlay(session);
		returnFocus();
	}

	// The preedit owns the surface during composition: nothing anchored may sit
	// over text the IME is still rewriting.
	function suppressOverlaysDuringComposition(): void {
		session = closeOverlay(session);
	}

	$effect(() => {
		editor?.updateContext(context);
	});

	$effect(() => {
		editor?.updateCallbacks(internalCallbacks());
	});

	onMount(() => {
		let cancelled = false;

		void (async () => {
			const { createLyricEditor } = await import('./create-editor.js');
			if (cancelled) {
				return;
			}
			const options: CreateLyricEditorOptions = {
				initialText,
				initialSelection,
				initialRevision,
				context,
				callbacks: internalCallbacks(),
				onSelectionAnchor(anchor) {
					selectionAnchorTick = scrollTick;
					selectionAnchor = anchor;
					const report = reportSelectionAnchor(session, anchor);
					session = report.session;
					if (anchor && report.assignRequested) {
						callbacks.onAssignRequest({ range: anchor.range, prefer: anchor.prefer });
					}
				}
			};
			editor = createLyricEditor(host, options);
			editor.handle.requestPerformerLegendAssignment = startLegendAssignment;
			handle = editor.handle;
			editor.view.scrollDOM.addEventListener('scroll', bumpScrollTick, { passive: true });
			// The update bridge deliberately stays silent for the initial state
			// (it only emits for document or selection changes), so freshly
			// loaded drafts would otherwise never reach the lint pipeline.
			// Emit one snapshot now; the shell's enrichment is idempotent and
			// re-applying context dispatches an effects-only transaction that
			// the bridge ignores, so this cannot re-enter.
			internalCallbacks().onSnapshot(handle.getSnapshot());
			onready?.(handle);
		})();

		return () => {
			cancelled = true;
			editor?.view.scrollDOM.removeEventListener('scroll', bumpScrollTick);
			editor?.destroy();
			editor = undefined;
			handle = undefined;
			ondestroyed?.();
		};
	});
</script>

<div
	class="editor-pane"
	class:reduced-motion={context.reducedMotion}
	bind:this={host}
	data-testid="lyric-editor"
	oncompositionstart={suppressOverlaysDuringComposition}
></div>

{#if performerOverlay}
	{#key legend?.step ?? 'selection'}
		<PerformerPicker
			performers={context.performers}
			initialSelectedIds={legend
				? legend.step === 'section'
					? legend.sectionPerformerIds
					: legend.styledPerformerIds
				: performerIdsForRange(performerOverlay.range)}
			removalAvailable={!legend && canRemoveFormattingForRange(performerOverlay.range)}
			prompt={legendPrompt}
			applyLabel={legend?.step === 'section' ? 'Next' : 'Apply'}
			returnFocusOnApply={legend?.step !== 'section'}
			allowRemoval={!legend}
			anchor={overlayAnchor}
			placement={overlayPlacement}
			onApply={applyPerformers}
			onCancel={cancelPerformer}
			{returnFocus}
			onAddPerformer={callbacks.onAddPerformer
				? (displayName) => callbacks.onAddPerformer?.(displayName)
				: undefined}
		/>
	{/key}
{:else if sectionOverlay}
	<SectionPicker
		languagePack={fallbackLanguagePack}
		existingHeaders={existingHeaders()}
		neighbors={sectionHeaderNeighbors(sectionOverlay.range)}
		range={sectionOverlay.range}
		anchor={overlayAnchor}
		onChoose={chooseSection}
		onCancel={() => (session = closeOverlay(session))}
		{returnFocus}
	/>
{:else if diagnosticOverlay}
	<DiagnosticPopover
		diagnostic={diagnosticOverlay.diagnostic}
		sources={context.sources}
		anchor={overlayAnchor}
		takeFocus={diagnosticOverlay.takesFocus}
		onPreviewFix={previewFix}
		onCancelPreview={clearFixPreview}
		onApplyFix={applyFix}
		fixBatchSize={callbacks.countDiagnosticFixBatch
			? (fix) => callbacks.countDiagnosticFixBatch?.(diagnosticOverlay.diagnostic, fix) ?? 0
			: undefined}
		onApplyFixBatch={callbacks.onApplyDiagnosticFixBatch ? applyFixBatch : undefined}
		onChooseHeader={() => startHeaderChoice(diagnosticOverlay.diagnostic)}
		onAssignPerformers={legendTarget(diagnosticOverlay.diagnostic)
			? () => startLegendAssignment(diagnosticOverlay.diagnostic)
			: undefined}
		onSetLanguage={callbacks.onSetLanguage ? setLanguage : undefined}
		onIgnore={ignoreDiagnostic}
		onDismiss={(heldFocus) => {
			clearFixPreview();
			session = closeOverlay(session);
			// A card the pointer merely left never held focus; pulling the caret
			// into the editor there would hijack whatever the user was typing in.
			if (heldFocus) {
				returnFocus();
			}
		}}
	/>
{/if}

<style>
	.editor-pane {
		position: relative;
		height: 100%;
		min-height: 12rem;
		overflow: hidden;
		background: var(--color-surface);
	}

	@media (prefers-reduced-motion: reduce) {
		.editor-pane,
		.editor-pane :global(*) {
			scroll-behavior: auto !important;
			transition-duration: 0.01ms !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
		}
	}

	.reduced-motion,
	.reduced-motion :global(*) {
		scroll-behavior: auto !important;
		transition-duration: 0.01ms !important;
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
	}
</style>
