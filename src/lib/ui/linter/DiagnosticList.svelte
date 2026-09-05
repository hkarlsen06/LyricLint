<script lang="ts">
	import type { Diagnostic, SourceReference, TextRange } from '$lib/core/types.js';
	import { tick, type Snippet } from 'svelte';
	import { BookOpen, CheckCheck } from 'lucide-svelte';
	import { diagnosticKey, orderDiagnostics } from '$lib/diagnostics/order.js';
	import { describeControl } from '$lib/ui/state/control-tooltip.svelte.js';
	import DiagnosticMeta from '$lib/diagnostics/DiagnosticMeta.svelte';
	import DiagnosticDetails from './DiagnosticDetails.svelte';

	let {
		diagnostics,
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
		 * that cannot take one — no header, or two styled voices and no plain
		 * lyrics — gets no button rather than one that only explains itself.
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
		 * shell, which plans against the whole visible list — a card only knows
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
	const sortedDiagnostics = $derived(orderDiagnostics(diagnostics));

	const cardKey = diagnosticKey;

	// Exactly one card sits expanded at a time; before any explicit choice the
	// top card starts expanded so the panel is never a wall of closed rows.
	let chosenKey = $state<string | undefined>();
	let collapsedKey = $state<string | undefined>();
	let list = $state<HTMLOListElement>();
	const selectedKey = $derived.by(() => {
		if (
			activeDiagnosticKey &&
			sortedDiagnostics.some((diagnostic) => cardKey(diagnostic) === activeDiagnosticKey)
		) {
			return activeDiagnosticKey;
		}
		if (chosenKey && sortedDiagnostics.some((diagnostic) => cardKey(diagnostic) === chosenKey)) {
			return chosenKey;
		}
		const first = sortedDiagnostics[0];
		return first ? cardKey(first) : undefined;
	});

	const expandedKey = $derived(
		active && !overview && (focusedOnly || selectedKey !== collapsedKey) ? selectedKey : undefined
	);
	const currentIndex = $derived(
		sortedDiagnostics.findIndex((item) => cardKey(item) === selectedKey)
	);

	$effect(() => {
		const key = activeDiagnosticKey;
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
		const current = sortedDiagnostics.find((item) => cardKey(item) === key);
		if (current) void tick().then(() => onNavigate(current));
	});

	function activate(diagnostic: Diagnostic): void {
		if (!focusedOnly && expandedKey === cardKey(diagnostic)) {
			collapsedKey = cardKey(diagnostic);
			return;
		}
		collapsedKey = undefined;
		chosenKey = cardKey(diagnostic);
		onNavigate(diagnostic);
	}

	function step(direction: -1 | 1): void {
		const target = sortedDiagnostics[currentIndex + direction];
		if (!target) return;
		collapsedKey = undefined;
		chosenKey = cardKey(target);
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
		class:diagnostic-list__empty--clean={emptyState.clean}
		class:diagnostic-list__empty--settled={emptyState.settled}
		class:diagnostic-list__empty--waiting={emptyState.waiting}
	>
		{#if emptyState.waiting}
			<BookOpen class="diagnostic-list__empty-mark" aria-hidden="true" strokeWidth={1.25} />
		{:else if emptyState.settled}
			<CheckCheck class="diagnostic-list__empty-mark" aria-hidden="true" strokeWidth={1.25} />
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
		{#each sortedDiagnostics as diagnostic (`${cardKey(diagnostic)}:${diagnostic.message}`)}
			{@const expanded = cardKey(diagnostic) === expandedKey}
			<li
				data-diagnostic-key={cardKey(diagnostic)}
				hidden={focusedOnly && cardKey(diagnostic) !== selectedKey}
				class:diagnostic-error={diagnostic.severity === 'error'}
				class:diagnostic-card--expanded={expanded}
				class:diagnostic-card--active={expanded && cardKey(diagnostic) === activeDiagnosticKey}
			>
				<!--
					The row is still the control: the button stretches over the whole
					head, so a press anywhere on the card opens the diagnostic. It no
					longer *contains* the head, because the meta line ends in a link to
					the cited source, and an `<a>` inside a `<button>` is neither valid
					nor reliably pressable. The link lifts above the stretched layer
					instead — it is the one place on the card that does something else.
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
					<DiagnosticMeta
						{diagnostic}
						{sources}
						line={lineFor?.(
							cardKey(diagnostic) === activeDiagnosticKey
								? (activeDiagnosticRange?.from ?? diagnostic.from)
								: diagnostic.from
						)}
					/>
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
