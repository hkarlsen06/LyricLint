<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type {
		AtomicDocumentEdit,
		Diagnostic,
		DiagnosticFix,
		EditorSnapshot,
		LanguagePack,
		LinkDifference,
		PerformerId,
		StyleSlot,
		TextRange
	} from '$lib/core/types.js';
	import { lineNumberAt } from '$lib/core/line-numbers.js';
	import {
		resolveLegendAssignment,
		type LegendAssignmentResolution
	} from '$lib/performers/legend-assignment.js';
	import {
		assignmentNeedsSectionVoice,
		assignmentSelectionRange,
		unknownVoiceOffers
	} from '$lib/performers/transform.js';
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
		askSectionVoice,
		beginLegendAssignment,
		cachedAnchorRect,
		cancelPerformerPicker,
		cancelSectionLinkPicker,
		closeOverlay,
		closedOverlaySession,
		dismissDiagnostic,
		finishPerformerAssignment,
		forgetDismissedSelection,
		openPerformerPicker,
		openSectionLinkPicker,
		openSectionPicker,
		overlayRange,
		releaseUnanchoredDiagnostic,
		reportSelectionAnchor,
		type LegendTarget,
		type OverlaySession
	} from './overlay-state.js';
	import DiagnosticPopover from './overlays/DiagnosticPopover.svelte';
	import PerformerPicker from './overlays/PerformerPicker.svelte';
	import SectionLinkPicker from './overlays/SectionLinkPicker.svelte';
	import SectionPicker from './overlays/SectionPicker.svelte';
	import type { SectionHeaderNeighbors } from './overlays/section-picker.js';
	import { linkOccurrences, type LinkOccurrence } from './section-links.js';

	/** What `createPerformerEdit` takes, read off the contract rather than restated here. */
	type PerformerChoice = Parameters<NonNullable<LyricEditorCallbacks['createPerformerEdit']>>[0];
	type UnknownVoiceChoice = Parameters<
		NonNullable<LyricEditorCallbacks['createUnknownVoiceEdit']>
	>[0];

	let {
		initialText,
		initialSelection,
		initialRevision = 0,
		context,
		callbacks,
		handle = $bindable(),
		onready,
		ondestroyed,
		sectionGhosts = true,
		autoHeight = false,
		windowFind = true
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
		anchorRange
			? anchorPlacement(selectionAnchor, anchorRange, roomiestSide(overlayAnchor))
			: 'above'
	);

	/**
	 * Which side of a measured rect has room, for a card no reported selection
	 * anchor describes — the `Mod-Shift-L` path opens on a bare caret. The same
	 * comparison `selectionAnchorForView` makes, so a card that opens from the
	 * pointer and one that opens from the keyboard land on the same side.
	 */
	function roomiestSide(rect: ScreenRect | undefined): 'above' | 'below' {
		if (!rect) {
			return 'above';
		}
		const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
		return rect.top > viewportHeight - rect.bottom ? 'above' : 'below';
	}

	// The variants are projected here rather than narrowed with `{@const}` in the
	// branches: a derived that belongs to the component outlives the block effect
	// the overlay's own callbacks fire from.
	const performerOverlay = $derived(overlay.kind === 'performer' ? overlay : undefined);
	const sectionOverlay = $derived(overlay.kind === 'section' ? overlay : undefined);
	const linkOverlay = $derived(overlay.kind === 'link' ? overlay : undefined);
	const diagnosticOverlay = $derived(overlay.kind === 'diagnostic' ? overlay : undefined);
	const legend = $derived(performerOverlay?.legend);
	const pendingVoice = $derived(performerOverlay?.pendingVoice);
	// Whether applying will need a second step. Read before the press so the
	// button can say `Next` rather than promising an assignment and then asking
	// another question — the legend flow's first step does the same.
	//
	// A function reading the session state directly, rather than a `$derived` over
	// the projections above: the press that consumes it arrives from inside the
	// picker's own `{#key}` block, and that block is being torn down as the
	// handler runs. The answer has to come from the state, not from a cache the
	// dying effect owns.
	function needsSectionVoice(): boolean {
		const current = session.overlay;
		return (
			current.kind === 'performer' &&
			!current.legend &&
			!current.pendingVoice &&
			context.parsed !== undefined &&
			assignmentNeedsSectionVoice(context.parsed, {
				anchor: current.range.from,
				head: current.range.to
			})
		);
	}
	// The unknown-voice answers this selection could take, read from the same
	// transform that will honour them (`unknownVoiceOffers`), so a chip drawn
	// here is an assignment that will not refuse when pressed. Only the plain
	// selection flow offers them: the legend flow is already naming a known
	// voice, and step two's question is about the section's plain lyrics, which
	// an unknown cannot answer — nothing would be written for it.
	//
	// A function for the same reason `needsSectionVoice` is one: the press that
	// consumes it arrives from inside the picker's own `{#key}` block.
	function unknownVoiceOffer(): ReturnType<typeof unknownVoiceOffers> {
		const current = session.overlay;
		if (
			current.kind !== 'performer' ||
			current.legend ||
			current.pendingVoice ||
			context.parsed === undefined
		) {
			return { existingSlots: [], canAllocateNew: false };
		}
		return unknownVoiceOffers(context.parsed, {
			anchor: current.range.from,
			head: current.range.to
		});
	}

	// The step counter belongs to the two-voice flow only. A styled-only section
	// names one voice, and the prompt says up front that its markup goes with the
	// assignment — the picker is where that consequence is agreed to.
	// The step is carried beside the question rather than written into it: the
	// picker draws it as a bar under the words, so `· 1 of 2` in the string would
	// be the same fact twice and would change the question's width at every step.
	const legendPrompt = $derived(
		legend
			? legend.promoteToPlain
				? { text: 'Section voice · formatting removed' }
				: legend.step === 'section'
					? { text: 'General section voice', step: 1, stepCount: 2 }
					: { text: 'Styled passage', step: 2, stepCount: 2 }
			: pendingVoice
				? { text: 'Who sings the rest?', step: 2, stepCount: 2 }
				: needsSectionVoice()
					? { text: 'Who sings this?', step: 1, stepCount: 2 }
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

	// The range the assignment would actually rewrite — the transform's own
	// reading of the selection (whitespace trimmed, a lone parenthetical shrunk
	// inside its parens, a caret grown to its line) rather than a second opinion
	// read off the raw range. The chips lit on open are part of what Apply
	// writes, so they are derived against what Apply will touch. The raw range
	// stands in only while the shell's parse has not arrived.
	function assignmentRangeFor(range: TextRange): TextRange {
		if (context.parsed === undefined) {
			return range;
		}
		return (
			assignmentSelectionRange(context.parsed, { anchor: range.from, head: range.to }) ?? range
		);
	}

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

	// The diagnostic's own range is the header, and the picker takes it as both
	// the anchor and the source it links from — which the rule guarantees is a
	// section with words in it, never the empty repeat about to be filled.
	function startSectionLink(diagnostic: Diagnostic): void {
		internalCallbacks().onSectionLinkRequest?.({
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
			// The keyboard's own way in, `Ctrl-Alt-P` — a press that meant only
			// this, and one with no pointer behind it to drive the card, so it
			// takes the focus. The pointer path never reaches here: it opens
			// through `reportSelectionAnchor` and forwards to the outer callbacks.
			onAssignRequest(request) {
				session = openPerformerPicker(session, request.range, true);
				callbacks.onAssignRequest(request);
			},
			onSectionHeaderRequest(request) {
				session = openSectionPicker(session, request.range);
				callbacks.onSectionHeaderRequest(request);
			},
			// Not forwarded: linking is one document edit repeated, so there is
			// nothing here for the shell to arbitrate. `request.range` is the
			// header itself, which the keyboard command resolved from the caret.
			//
			// No origin means aimed: `Mod-Shift-L` and the diagnostic's guided
			// action are both presses that meant only this. Only the `⇄` marker
			// names one, because only it opens the card two ways.
			onSectionLinkRequest(request, origin) {
				linkTrigger = origin?.returnFocus;
				session = openSectionLinkPicker(
					session,
					request.range,
					request.range.from,
					origin?.takesFocus ?? true,
					request.selection
				);
			},
			// Every caller of this one is a pointer: the hovered underline and the
			// cluster badge. It shows the card where the text already is; the shell
			// only gets to mark the matching entry, never to travel to it.
			onDiagnosticActivate(diagnostic, range) {
				session = activateDiagnostic(session, diagnostic, false, range);
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

	/** What the `⇄` marker that opened the link card hands the focus back to. */
	let linkTrigger = $state.raw<(() => boolean) | undefined>();

	/**
	 * Where the focus goes when the link card closes without arming an edit.
	 *
	 * A card the pointer opened uninvited never took the caret, so it has none to
	 * give back — the same rule dismissing a hovered diagnostic follows. One that
	 * was asked for returns it to whatever asked: the marker, which promises a
	 * dialog and therefore promises the way back out of one, or the document,
	 * which is where both keyboard paths were standing.
	 */
	const returnFocusFromLink = $derived(
		linkOverlay?.takesFocus
			? () => {
					if (!linkTrigger?.()) {
						returnFocus();
					}
				}
			: () => {}
	);

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
		const position = Math.min(
			overlayRange(current)?.from ?? current.diagnostic.from,
			view.state.doc.length
		);
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
		// A selection assignment that would open the legend at italic asks who
		// sings the unstyled lyrics before it writes anything, because that is the
		// one fact the document cannot supply and `performer.style-order` cannot
		// invent. The picker stays mounted for the answer.
		if (needsSectionVoice() && performerIds.length > 0) {
			session = askSectionVoice(session, performerIds);
			return;
		}
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
			let edit: AtomicDocumentEdit | undefined;
			if (outcome.kind === 'legend') {
				edit = await callbacks.createPerformerLegendEdit?.({
					sectionFrom: outcome.sectionFrom,
					assignments: outcome.assignments,
					unwrapSlots: outcome.unwrapSlots
				});
			} else {
				const choice: PerformerChoice = {
					range: outcome.range,
					performerIds: [...outcome.performerIds]
				};
				if (outcome.sectionPerformerIds) choice.sectionPerformerIds = outcome.sectionPerformerIds;
				edit = await callbacks.createPerformerEdit?.(choice);
			}
			if (edit) {
				const anchor = outcome.kind === 'legend' ? outcome.sectionFrom : outcome.range.from;
				if (editor?.handle.dispatchLinkedPerformer) {
					editor.handle.dispatchLinkedPerformer(edit, anchor);
				} else {
					editor?.handle.dispatchAtomic(edit);
				}
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

	/**
	 * An unknown chip pressed: wrap the selection as a styled voice the legend
	 * never names. One press is the whole answer — no legend means no second
	 * question about who sings the rest — so the picker closes on it exactly as
	 * a committed range assignment does, selection suppressed and all.
	 */
	async function applyUnknownVoice(styleSlot?: StyleSlot): Promise<void> {
		const current = session.overlay;
		if (current.kind !== 'performer') {
			return;
		}
		const range = current.range;
		try {
			const choice: UnknownVoiceChoice = styleSlot === undefined ? { range } : { range, styleSlot };
			const edit = await callbacks.createUnknownVoiceEdit?.(choice);
			if (edit) {
				if (editor?.handle.dispatchLinkedPerformer) {
					editor.handle.dispatchLinkedPerformer(edit, range.from);
				} else {
					editor?.handle.dispatchAtomic(edit);
				}
			}
		} catch (error) {
			callbacks.onAnnouncement(
				error instanceof Error ? error.message : 'The unknown voice could not be applied.'
			);
		}
		session = finishPerformerAssignment(session, { kind: 'range', range, performerIds: [] });
	}

	/**
	 * Every discovered copy, read from the editor's own snapshot rather than from
	 * `context.parsed` — the shell's parse lands a beat behind the document, and a
	 * list of sections that is one keystroke stale would offer offsets the link is
	 * written against. Stored peers are included before similarity is considered.
	 */
	function sectionsToLink(headerFrom: number): LinkOccurrence[] {
		const parsed = editor?.handle.getSnapshot().parsed;
		if (!parsed) {
			return [];
		}
		const currentLine = lineNumberAt(parsed.text, headerFrom);
		const group = (editor?.handle.getSectionLinks?.() ?? []).find((link) =>
			link.lines.includes(currentLine)
		);
		const includeHeaderOffsets = group
			? parsed.sections.flatMap((section) =>
					section.header && group.lines.includes(lineNumberAt(parsed.text, section.header.from))
						? [section.header.from]
						: []
				)
			: [];
		return linkOccurrences(parsed, fallbackLanguagePack, headerFrom, { includeHeaderOffsets });
	}

	/** The sections already tied to this one, so the card opens on the truth. */
	function linkedPeers(headerFrom: number, occurrences: readonly LinkOccurrence[]): number[] {
		const currentLine = occurrences.find(
			(occurrence) => occurrence.headerFrom === headerFrom
		)?.line;
		if (currentLine === undefined) {
			return [];
		}
		const group = (editor?.handle.getSectionLinks?.() ?? []).find((link) =>
			link.lines.includes(currentLine)
		);
		return group
			? occurrences
					.filter(
						(occurrence) =>
							occurrence.headerFrom !== headerFrom && group.lines.includes(occurrence.line)
					)
					.map((occurrence) => occurrence.headerFrom)
			: [];
	}

	/**
	 * What the group of these headers would disagree on.
	 *
	 * Asked of the editor on every tick rather than computed once, because a set
	 * that is not yet a group has no stored shape — what two unlinked choruses
	 * differ on is worked out from the words, and ticking a third changes the
	 * answer.
	 */
	function linkDifferences(headerOffsets: number[]): LinkDifference[] {
		return editor?.handle.getLinkDifferences?.(headerOffsets) ?? [];
	}

	function applySectionLink(choice: {
		headers: number[];
		keepDifferent: boolean[];
		makeDifferent?: TextRange;
		replaceFrom?: number;
	}): void {
		const closing = choice.keepDifferent.filter((kept) => !kept).length;
		editor?.handle.linkSections?.(choice);
		// Linking writes nothing on its own, so saying it "overwrote" the others
		// would be false; what a screen reader needs is how many copies are now in
		// step and how much of them is deliberately not.
		const kept =
			choice.keepDifferent.filter((keep) => keep).length + (choice.makeDifferent ? 1 : 0);
		callbacks.onAnnouncement(
			choice.headers.length > 1
				? `${choice.headers.length} sections linked${kept > 0 ? `, keeping ${kept} difference${kept === 1 ? '' : 's'}` : ''}${closing > 0 ? `, ${closing} made to agree` : ''}. Editing one now edits them all.`
				: 'Section unlinked.'
		);
		session = closeOverlay(session);
	}

	function beginTypeOnlyHere(headerFrom: number): boolean {
		const turningOff = editor?.handle.isTypeOnlyHere?.(headerFrom) ?? false;
		if (!editor?.handle.typeOnlyHere?.(headerFrom)) {
			callbacks.onAnnouncement('This section is no longer linked.');
			return turningOff;
		}
		callbacks.onAnnouncement(
			turningOff
				? 'Editing only this section turned off. Future edits to shared words will update the linked sections.'
				: 'Editing only this section. Changes anywhere in it stay here until you turn this off.'
		);
		return !turningOff;
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

		const target = sections[targetIndex];
		// When the command points at a lyric line inside an already headed section,
		// that section's header is before the new boundary. Count it when choosing
		// the next ordinal and offer it as the nearest previous part. A diagnostic
		// targeting the section's own empty header keeps the older shape: that
		// header is the thing being named, not a predecessor.
		const splitsHeadedSection = target?.header !== undefined && range.from > target.header.to;
		const headersBeforeEnd = targetIndex + (splitsHeadedSection ? 1 : 0);
		const headersBefore = sections
			.slice(0, headersBeforeEnd)
			.flatMap((section) => (section.header ? [section.header.rawNamePart] : []));
		let previousHeader: string | undefined;
		for (let index = headersBeforeEnd - 1; index >= 0; index -= 1) {
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
		// Same rule as dismissal and as applying a fix: only a popover that held
		// focus hands it back. A hovered card's control was pressed with a pointer
		// that never took the caret, so pulling it into the editor would arm the
		// user's next keystroke over text they never chose.
		if (current.kind === 'diagnostic' && current.takesFocus) {
			returnFocus();
		}
	}

	function setLanguage(language: string): void {
		const current = session.overlay;
		callbacks.onSetLanguage?.(language);
		session = closeOverlay(session);
		if (current.kind === 'diagnostic' && current.takesFocus) {
			returnFocus();
		}
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
				// Read once, with the rest of the mount options: the extension list
				// is built when the view is created, and the window listener is bound
				// with it, so none of these is something a pane can change without
				// remounting.
				sectionGhosts,
				autoHeight,
				windowFind,
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
	class:auto-height={autoHeight}
	class:reduced-motion={context.reducedMotion}
	bind:this={host}
	data-testid="lyric-editor"
	oncompositionstart={suppressOverlaysDuringComposition}
></div>

{#if performerOverlay}
	{#key legend?.step ?? (pendingVoice ? 'section-voice' : 'selection')}
		{@const unknownOffer = unknownVoiceOffer()}
		{@const assignmentRange = assignmentRangeFor(performerOverlay.range)}
		<PerformerPicker
			performers={context.performers}
			unknownSlots={unknownOffer.existingSlots}
			canAddUnknown={unknownOffer.canAllocateNew}
			onAssignUnknown={callbacks.createUnknownVoiceEdit ? applyUnknownVoice : undefined}
			initialSelectedIds={legend
				? legend.step === 'section'
					? legend.sectionPerformerIds
					: legend.styledPerformerIds
				: pendingVoice
					? []
					: performerIdsForRange(assignmentRange)}
			removalAvailable={!legend && !pendingVoice && canRemoveFormattingForRange(assignmentRange)}
			prompt={legendPrompt?.text}
			step={legendPrompt?.step}
			stepCount={legendPrompt?.stepCount}
			applyLabel={legend?.step === 'section' || needsSectionVoice() ? 'Next' : 'Apply'}
			emptyApplyLabel={pendingVoice ? 'Skip' : undefined}
			returnFocusOnApply={legend?.step !== 'section' && !needsSectionVoice()}
			takesFocus={performerOverlay.takesFocus}
			allowRemoval={!legend && !pendingVoice}
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
{:else if linkOverlay}
	{@const occurrences = sectionsToLink(linkOverlay.headerFrom)}
	{@const typeOnlyHereAvailable = editor?.handle.canTypeOnlyHere?.(linkOverlay.headerFrom) ?? false}
	{@const typeOnlyHereActive = editor?.handle.isTypeOnlyHere?.(linkOverlay.headerFrom) ?? false}
	<SectionLinkPicker
		{occurrences}
		currentHeaderFrom={linkOverlay.headerFrom}
		initialSelected={linkedPeers(linkOverlay.headerFrom, occurrences)}
		differencesFor={linkDifferences}
		pendingSelection={linkOverlay.selection}
		pendingSelectionText={linkOverlay.selection
			? editor?.handle
					.getSnapshot()
					.text.slice(linkOverlay.selection.from, linkOverlay.selection.to)
			: undefined}
		{typeOnlyHereAvailable}
		{typeOnlyHereActive}
		takesFocus={linkOverlay.takesFocus}
		anchor={overlayAnchor}
		placement={overlayPlacement}
		onApply={applySectionLink}
		onTypeOnlyHere={() => beginTypeOnlyHere(linkOverlay.headerFrom)}
		onCancel={() => (session = cancelSectionLinkPicker(session))}
		returnFocus={returnFocusFromLink}
	/>
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
		onLinkSections={() => startSectionLink(diagnosticOverlay.diagnostic)}
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

	/*
	 * The host of a pane that is as tall as its document owns no size and paints
	 * nothing. Both halves of that matter:
	 *
	 * - A `height: 100%` that resolves to nothing still leaves `min-height: 12rem`
	 *   standing, so a short document gets a foot of empty surface under it — and
	 *   before CodeMirror has loaded, that empty box is the whole of what the host
	 *   contributes, stacked under the stand-in that is already drawing the verse.
	 * - The fill is a square box behind a child that draws a rounded one. Where the
	 *   two are the same size, the host's corners paint outside the editor's curve
	 *   and the box reads as poking out of itself. In the workbench the editor has
	 *   no radius and fills the column, so the fill is correct there and stays.
	 */
	.editor-pane.auto-height {
		height: auto;
		min-height: 0;
		overflow: visible;
		background: transparent;
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
