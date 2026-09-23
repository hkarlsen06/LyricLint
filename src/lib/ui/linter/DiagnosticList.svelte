<script lang="ts">
	import type { Diagnostic, SourceReference, TextRange } from '$lib/core/types.js';
	import { tick, type Snippet } from 'svelte';
	import BookOpenIcon from 'phosphor-svelte/lib/BookOpenIcon';
	import ChecksIcon from 'phosphor-svelte/lib/ChecksIcon';
	import { diagnosticKey, orderDiagnostics } from '$lib/diagnostics/order.js';
	import { describeControl } from '$lib/ui/state/control-tooltip.svelte.js';
	import DiagnosticMeta from '$lib/diagnostics/DiagnosticMeta.svelte';
	import DiagnosticDetails from './DiagnosticDetails.svelte';

	let {
		diagnostics,
		rowKey,
		active = true,
		overview = false,
		focusedOnly = false,
		sources,
		activeDiagnosticKey,
		activeDiagnosticRange,
		emptyState,
		emptyActions,
		lineFor,
		onNavigate,
		onChooseHeader,
		canAssignPerformers = () => true,
		onAssignPerformers = () => {},
		onLinkSections,
		onSetLanguage,
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		fixBatchSize,
		onApplyFixBatch,
		onIgnore
	}: {
		diagnostics: readonly Diagnostic[];
		rowKey: (diagnostic: Diagnostic) => string;
		active?: boolean;
		overview?: boolean;
		focusedOnly?: boolean;
		sources: ReadonlyMap<string, SourceReference>;
		activeDiagnosticKey?: string;
		activeDiagnosticRange?: TextRange;
		/** Empty, clean, and set-aside reviews have distinct composed states.
		 * Filtered findings stay beside the controls that reveal them. */
		emptyState: {
			title: string;
			detail: string;
			clean?: boolean;
			settled?: boolean;
			waiting?: boolean;
			status?: boolean;
		};
		/**
		 * What the reader can do about the empty state, when there is anything.
		 * Only the untouched-document case has an answer worth a control; the
		 * other three are already resolved by something elsewhere in the panel.
		 */
		emptyActions?: Snippet;
		lineFor?: (offset: number) => number;
		onNavigate: (diagnostic: Diagnostic) => void;
		onChooseHeader: (diagnostic: Diagnostic) => void;
		/**
		 * Whether the expanded card offers the performer assignment. A section
		 * that cannot take one (no header, or two styled voices and no plain
		 * lyrics) gets no button rather than one that only explains itself.
		 */
		canAssignPerformers?: (diagnostic: Diagnostic) => boolean;
		onAssignPerformers?: (diagnostic: Diagnostic) => void;
		/** Open the link picker on a repeated section. The rule found the group;
		 *  the picker is what names it before anything is overwritten. */
		onLinkSections?: (diagnostic: Diagnostic) => void;
		onSetLanguage: (language: string) => void;
		onPreviewFix: (diagnostic: Diagnostic, fix: NonNullable<Diagnostic['fixes']>[number]) => void;
		onCancelPreview: () => void;
		onApplyFix: (diagnostic: Diagnostic, fix: NonNullable<Diagnostic['fixes']>[number]) => void;
		/**
		 * The batch behind a fix, and the way to apply it. Both come from the
		 * shell, which plans against the whole visible list; a card only knows
		 * its own finding.
		 */
		fixBatchSize?: (
			diagnostic: Diagnostic,
			fix: NonNullable<Diagnostic['fixes']>[number]
		) => number;
		onApplyFixBatch?: (
			diagnostic: Diagnostic,
			fix: NonNullable<Diagnostic['fixes']>[number]
		) => void;
		onIgnore: (diagnostic: Diagnostic) => void;
	} = $props();

	// The panel's reading order is shared with the state that follows it: after a
	// fix the workbench hands the editor to the diagnostic this list leads with,
	// so the two may not sort by different rules.
	const cardKey = diagnosticKey;
	const activeKey = $derived(active ? activeDiagnosticKey : undefined);
	let lastRows: Array<{ key: string; diagnostic: Diagnostic; line: number | undefined }> = [];
	const rows = $derived.by(() => {
		// Keep the same controls while hidden, without sorting, numbering, or
		// updating their contents for a pane the user cannot see. Activation reads
		// the latest complete snapshot before these controls become actionable.
		if (active) {
			lastRows = orderDiagnostics(diagnostics).map((diagnostic) => ({
				key: rowKey(diagnostic),
				diagnostic,
				line: lineFor?.(
					cardKey(diagnostic) === activeKey
						? (activeDiagnosticRange?.from ?? diagnostic.from)
						: diagnostic.from
				)
			}));
		}
		return lastRows;
	});
	const sortedDiagnostics = $derived(rows.map((row) => row.diagnostic));

	// Exactly one card sits expanded at a time; before any explicit choice the
	// top card starts expanded so the panel is never a wall of closed rows.
	let chosenKey = $state<string | undefined>();
	let collapsedKey = $state<string | undefined>();
	let list = $state<HTMLOListElement>();
	const selectedKey = $derived.by(() => {
		const activeRow = activeKey && rows.find((row) => cardKey(row.diagnostic) === activeKey);
		if (activeRow) return activeRow.key;
		if (chosenKey && rows.some((row) => row.key === chosenKey)) {
			return chosenKey;
		}
		return rows[0]?.key;
	});

	const expandedKey = $derived(
		active && !overview && (focusedOnly || selectedKey !== collapsedKey) ? selectedKey : undefined
	);
	const currentIndex = $derived(rows.findIndex((row) => row.key === selectedKey));

	$effect(() => {
		const key = activeKey;
		const currentList = list;
		if (!active || !key || !currentList) return;
		void tick().then(() => {
			const card = Array.from(currentList.children).find(
				(candidate) => candidate.getAttribute('data-diagnostic-key') === key
			);
			card?.scrollIntoView({ block: 'nearest' });
		});
	});

	let revealedKey: string | undefined;
	$effect(() => {
		const key = active && focusedOnly ? selectedKey : undefined;
		if (key === revealedKey) return;
		revealedKey = key;
		const current = rows.find((row) => row.key === key)?.diagnostic;
		if (current) void tick().then(() => onNavigate(current));
	});

	function activate(diagnostic: Diagnostic): void {
		if (!focusedOnly && expandedKey === rowKey(diagnostic)) {
			collapsedKey = rowKey(diagnostic);
			return;
		}
		collapsedKey = undefined;
		chosenKey = rowKey(diagnostic);
		onNavigate(diagnostic);
	}

	function step(direction: -1 | 1): void {
		const target = sortedDiagnostics[currentIndex + direction];
		if (!target) return;
		collapsedKey = undefined;
		chosenKey = rowKey(target);
		onNavigate(target);
	}

	function navigateWithKeyboard(event: KeyboardEvent): void {
		if (
			!active ||
			event.defaultPrevented ||
			!event.altKey ||
			!event.shiftKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.isComposing
		)
			return;
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
		)
			return;
		// Pickers own their keyboard interaction even when the pointer opened them
		// without moving focus. Only visible surfaces count, not parked dialogs.
		if (
			Array.from(
				document.querySelectorAll('dialog, [role="dialog"], [role="menu"], [role="listbox"]')
			).some((surface) => surface.getClientRects().length > 0)
		)
			return;
		const direction = event.key === 'ArrowUp' ? -1 : 1;
		if (!sortedDiagnostics[currentIndex + direction]) return;
		event.preventDefault();
		step(direction);
	}

	async function runRemovingAction(
		trigger: HTMLButtonElement,
		action: () => void,
		fallbackSelector: string
	): Promise<void> {
		const row = trigger.closest('li');
		const index = row && list ? Array.from(list.children).indexOf(row) : 0;
		const nextKey = row?.nextElementSibling?.getAttribute('data-diagnostic-key');
		// The target may only become stable after the diagnostic disappears, so
		// look it up after the action and its resulting render have settled.
		const panel = trigger.closest('.right-panel');
		action();
		await tick();
		const rows = Array.from(list?.children ?? []);
		const next =
			rows.find((candidate) => candidate.classList.contains('diagnostic-card--expanded')) ??
			rows.find((candidate) => candidate.getAttribute('data-diagnostic-key') === nextKey) ??
			rows[Math.min(index, rows.length - 1)];
		const nextControl = next?.querySelector<HTMLButtonElement>('.diagnostic-list__navigate');
		if (nextControl) {
			nextControl.focus();
			return;
		}
		const fallback = [
			panel?.querySelector<HTMLButtonElement>(fallbackSelector),
			focusedOnly
				? document.querySelector<HTMLButtonElement>('#mobile-review-control')
				: panel?.querySelector<HTMLButtonElement>('#linter-panel-tab')
		].find((control) => control && control.getClientRects().length > 0);

		fallback?.focus();
	}

	function fixAndMoveFocus(action: () => void): void {
		const trigger = document.activeElement;
		if (trigger instanceof HTMLButtonElement && list?.contains(trigger)) {
			void runRemovingAction(trigger, action, '#linter-panel-tab');
		} else action();
	}

	function ignoreAndMoveFocus(diagnostic: Diagnostic, trigger: HTMLButtonElement): void {
		void runRemovingAction(trigger, () => onIgnore(diagnostic), '.ignored-rules__toggle');
	}

	function setLanguageAndMoveFocus(language: string, trigger: HTMLButtonElement): void {
		void runRemovingAction(trigger, () => onSetLanguage(language), '#linter-panel-tab');
	}
</script>

<svelte:window onkeydown={navigateWithKeyboard} />

{#if sortedDiagnostics.length === 0}
	<div
		class="empty-state diagnostic-list__empty"
		role={emptyState.status ? 'status' : undefined}
		class:diagnostic-list__empty--clean={emptyState.clean}
		class:diagnostic-list__empty--settled={emptyState.settled}
		class:diagnostic-list__empty--waiting={emptyState.waiting}
	>
		{#if emptyState.waiting}
			<BookOpenIcon class="diagnostic-list__empty-mark" aria-hidden="true" />
		{:else if emptyState.settled}
			<ChecksIcon class="diagnostic-list__empty-mark" aria-hidden="true" />
		{:else if emptyState.clean}
			<!-- The check the severity glyphs already use, at reading size and in the
			     success color. `aria-hidden` because the title beside it is the whole
			     of what it says. -->
			<svg
				class="diagnostic-list__empty-mark"
				aria-hidden="true"
				viewBox="0 0 16 16"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="8" cy="8" r="6" />
				<path d="M5.4 8.2 7.2 10l3.4-3.6" />
			</svg>
		{/if}
		<p class="diagnostic-list__empty-title">{emptyState.title}</p>
		<p>{emptyState.detail}</p>
		{@render emptyActions?.()}
	</div>
{:else}
	{#if !overview && sortedDiagnostics.length > 1}
		<div class="diagnostic-actions" role="group" aria-label="Navigate findings">
			<button
				type="button"
				class="button button--quiet"
				disabled={currentIndex <= 0}
				aria-keyshortcuts="Alt+Shift+ArrowUp"
				{@attach describeControl(() => ({ label: 'Previous finding', shortcut: 'Alt+Shift+↑' }))}
				onclick={() => step(-1)}>Previous</button
			>
			<span aria-live="polite">{currentIndex + 1} of {sortedDiagnostics.length}</span>
			<button
				type="button"
				class="button button--quiet"
				disabled={currentIndex >= sortedDiagnostics.length - 1}
				aria-keyshortcuts="Alt+Shift+ArrowDown"
				{@attach describeControl(() => ({ label: 'Next finding', shortcut: 'Alt+Shift+↓' }))}
				onclick={() => step(1)}>Next</button
			>
		</div>
	{/if}
	<ol bind:this={list} class="diagnostic-list" aria-label="Document diagnostics">
		{#each rows as row (row.key)}
			{@const diagnostic = row.diagnostic}
			{@const expanded = row.key === expandedKey}
			<li
				data-diagnostic-key={cardKey(diagnostic)}
				hidden={focusedOnly && row.key !== selectedKey}
				class:diagnostic-error={diagnostic.severity === 'error'}
				class:diagnostic-card--expanded={expanded}
				class:diagnostic-card--active={expanded && cardKey(diagnostic) === activeKey}
			>
				<!--
					The row is still the control: the button stretches over the whole
					head, so a press anywhere on the card opens the diagnostic. It no
					longer *contains* the head, because the meta line ends in a link to
					the cited source, and an `<a>` inside a `<button>` is neither valid
					nor reliably pressable. The link lifts above the stretched layer
					instead, and it is the one place on the card that does something else.
				-->
				<div class="diagnostic-list__head">
					<button
						type="button"
						class="diagnostic-list__navigate"
						aria-label={`Go to ${diagnostic.message}`}
						aria-expanded={expanded}
						onclick={() => activate(diagnostic)}
					>
						<span class="diagnostic-list__title">{diagnostic.message}</span>
					</button>
					<DiagnosticMeta {diagnostic} {sources} line={row.line} />
				</div>
				{#if expanded}
					<DiagnosticDetails
						{diagnostic}
						onChooseHeader={() => onChooseHeader(diagnostic)}
						onAssignPerformers={canAssignPerformers(diagnostic)
							? () => onAssignPerformers(diagnostic)
							: undefined}
						onLinkSections={onLinkSections ? () => onLinkSections(diagnostic) : undefined}
						onSetLanguage={setLanguageAndMoveFocus}
						onPreviewFix={(fix) => onPreviewFix(diagnostic, fix)}
						{onCancelPreview}
						onApplyFix={(fix) => fixAndMoveFocus(() => onApplyFix(diagnostic, fix))}
						fixBatchSize={fixBatchSize ? (fix) => fixBatchSize(diagnostic, fix) : undefined}
						onApplyFixBatch={onApplyFixBatch
							? (fix) => fixAndMoveFocus(() => onApplyFixBatch?.(diagnostic, fix))
							: undefined}
						onIgnore={(trigger) => ignoreAndMoveFocus(diagnostic, trigger)}
					/>
				{/if}
			</li>
		{/each}
	</ol>
{/if}

<style>
	/* Cards are edge to edge, but prose is not: inset the empty state to line up
	   with the filter row above it. */
	:global(.linter-panel) > .empty-state {
		padding: var(--space-2) var(--space-3) var(--space-4);
		margin: 0;
	}

	/* One short title naming the state, one muted line saying why and what to do.
	   Prose only: the bare panel canvas is the surface, not a box. */
	.diagnostic-list__empty {
		display: grid;
		gap: var(--space-1);
	}

	/* An empty or completed review should feel settled, not like a missing list.
	   Filtered findings stay beside their filters; the three resting states share
	   a composed, unboxed message. Set-aside findings remain distinct from clean. */
	.diagnostic-list__empty--clean,
	.diagnostic-list__empty--settled,
	.diagnostic-list__empty--waiting {
		flex: 1;
		/* Center against the panel, not a prose-width box parked at its left edge. */
		max-width: none;
		align-content: center;
		justify-items: center;
		gap: var(--space-2);
		text-align: center;
	}

	.diagnostic-list__empty p {
		margin: 0;
		max-width: var(--measure-prose);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-body);
		white-space: pre-line;
	}

	/* Global because two of the three marks are icon components, which render
	   their own `<svg>`. */
	.diagnostic-list__empty :global(.diagnostic-list__empty-mark) {
		width: var(--space-8);
		height: var(--space-8);
		margin-bottom: var(--space-4);
		color: var(--color-text-muted);
	}

	.diagnostic-list__empty--clean :global(.diagnostic-list__empty-mark) {
		color: var(--color-success);
	}

	.diagnostic-list__empty .diagnostic-list__empty-title {
		color: var(--color-text);
		font-size: var(--font-size-xl);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-tight);
	}

	/* Inset findings separate by space; only the open finding takes depth. */
	.diagnostic-list {
		display: grid;
		margin: 0;
		padding: var(--space-2) var(--space-3);
		gap: var(--space-2);
		list-style: none;
	}

	/* Resting findings read as a list. The open finding is the one surface with
	   an independent decision, so only it takes a fill and elevation. */
	.diagnostic-list > li {
		position: relative;
		border: 0;
		border-radius: var(--radius-panel);
		background: transparent;
	}

	.diagnostic-list > li.diagnostic-card--expanded,
	.diagnostic-list > li.diagnostic-card--active {
		z-index: 1;
		background: var(--color-surface);
		box-shadow: var(--shadow-raised);
	}

	/* The depth answers a press, so it arrives at the control tier's rate rather
	   than snapping. Only the tone, the shadow and the seams ease. The card's own
	   expansion stays instant, because a height between two documents' worth of
	   content has no honest intermediate frame. */
	@media (prefers-reduced-motion: no-preference) {
		.diagnostic-list > li {
			transition:
				background-color var(--duration-fast) var(--ease-out-quart),
				box-shadow var(--duration-fast) var(--ease-out-quart),
				border-color var(--duration-fast) var(--ease-out-quart);
		}
	}

	/* The head (not the list item) carries the card's padding: there is no dead
	   margin around the heading where a press lands on nothing. It is deliberately
	   unpositioned: the stretched press layer below resolves against the row, so a
	   containing block here would stop it at the head's own bottom edge. */
	.diagnostic-list__head {
		border-radius: inherit;
		display: grid;
		padding: var(--space-3) var(--space-4);
		gap: var(--space-1);
		justify-items: start;
	}

	/* Expanded, the head hands off to the details below it, so its bottom padding
	   becomes the seam between the two rather than a second full inset. */
	.diagnostic-card--expanded > .diagnostic-list__head {
		padding-bottom: var(--space-2);
	}

	/*
	 * The card's whole face is still the control, but the button no longer contains
	 * it: the meta line ends in a link to the cited source, and an `<a>` inside a
	 * `<button>` is neither valid nor reliably pressable. The button holds the
	 * message and stretches its hit area over the whole *row* instead (the head,
	 * the explanation under it, and the slack beside the actions), so a press
	 * anywhere on the card that is not aimed at something else opens the diagnostic.
	 */
	.diagnostic-list__navigate {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--color-text);
		text-align: start;
	}

	.diagnostic-list__navigate::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	/* Whatever does something else rides above the stretched layer and takes its own
	   press: the citation, its disclosure, and every decision in the expanded card
	   (lifted by `DiagnosticDetails.svelte`). The buttons and not the row they sit
	   in: lifting `.diagnostic-actions` would make the whole band dead, and the
	   slack beside the last control is card. */
	.diagnostic-list__head :global(.source-citation),
	.diagnostic-list__head :global(.diagnostic-meta__disclosure) {
		z-index: 1;
	}

	/* A z-index only counts on a positioned box, and only the citation brings its
	   own. */
	.diagnostic-list__head :global(.diagnostic-meta__disclosure) {
		position: relative;
	}

	/*
	 * Hover and focus belong to the whole head, because that is what the press
	 * target covers. Reading them off the button alone would light up only the
	 * message. Hovering the citation deliberately does not raise the row: the
	 * pointer is over the link, and the link is where the press would land.
	 */
	.diagnostic-list
		> li:not(.diagnostic-card--expanded)
		.diagnostic-list__head:has(.diagnostic-list__navigate:hover) {
		background: var(--color-control-hover);
	}

	/* Inset, because a full-bleed row's ring would otherwise be drawn over the
	   hairline into the neighbouring card. */
	.diagnostic-list__head:has(.diagnostic-list__navigate:focus-visible) {
		outline: var(--focus-ring-width) solid var(--color-focus);
		outline-offset: var(--focus-ring-offset);
	}

	.diagnostic-list__navigate:focus-visible {
		outline: none;
	}

	.diagnostic-list__title {
		font-weight: var(--font-weight-medium);
	}

	/* Keep this query aligned with PHONE_WORKSPACE_QUERY. An opened finding is
	   the task view's whole content, so it sheds the card's depth. */
	@media (pointer: coarse) and (max-width: 68rem) {
		:global(.linter-panel--focused) .diagnostic-list > li {
			background: transparent;
			box-shadow: none;
			padding-inline: 0;
		}

		.diagnostic-list > li[hidden] {
			display: none;
		}
	}
</style>
