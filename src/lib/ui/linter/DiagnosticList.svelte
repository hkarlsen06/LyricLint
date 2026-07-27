<script lang="ts">
	import type { Diagnostic, SourceReference } from '$lib/core/types.js';
	import { tick, type Snippet } from 'svelte';
	import { diagnosticKey, orderDiagnostics } from '$lib/diagnostics/order.js';
	import DiagnosticMeta from '$lib/diagnostics/DiagnosticMeta.svelte';
	import DiagnosticDetails from './DiagnosticDetails.svelte';

	let {
		diagnostics,
		sources,
		activeDiagnosticKey,
		emptyState,
		emptyActions,
		lineFor,
		onNavigate,
		onChooseHeader,
		canAssignPerformers = () => true,
		onAssignPerformers = () => {},
		onSetLanguage,
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		fixBatchSize,
		onApplyFixBatch,
		onIgnore
	}: {
		diagnostics: readonly Diagnostic[];
		sources: ReadonlyMap<string, SourceReference>;
		activeDiagnosticKey?: string;
		/**
		 * What an empty list means right now — an empty document, filters hiding
		 * everything, every issue ignored, or a genuinely clean draft — so the
		 * panel never just stops without saying which.
		 */
		emptyState: { title: string; detail: string };
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
	let list = $state<HTMLOListElement>();
	const expandedKey = $derived.by(() => {
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

	$effect(() => {
		const key = activeDiagnosticKey;
		const currentList = list;
		if (!key || !currentList) return;
		void tick().then(() => {
			const card = Array.from(currentList.children).find(
				(candidate) => (candidate as HTMLElement).dataset.diagnosticKey === key
			);
			card?.scrollIntoView({ block: 'nearest' });
		});
	});

	function activate(diagnostic: Diagnostic): void {
		chosenKey = cardKey(diagnostic);
		onNavigate(diagnostic);
	}

	async function runRemovingAction(
		trigger: HTMLButtonElement,
		action: () => void,
		fallbackSelector: string
	): Promise<void> {
		const row = trigger.closest('li');
		const nextRowControl = row?.nextElementSibling?.querySelector<HTMLButtonElement>(
			'.diagnostic-list__navigate'
		);
		// The target may only become stable after the diagnostic disappears, so
		// look it up after the action and its resulting render have settled.
		const panel = trigger.closest('.right-panel');
		action();
		await tick();
		if (nextRowControl?.isConnected) {
			nextRowControl.focus();
			return;
		}
		const fallback =
			panel?.querySelector<HTMLButtonElement>(fallbackSelector) ??
			panel?.querySelector<HTMLButtonElement>('#linter-panel-tab');
		fallback?.focus();
	}

	function ignoreAndMoveFocus(diagnostic: Diagnostic, trigger: HTMLButtonElement): void {
		void runRemovingAction(trigger, () => onIgnore(diagnostic), '.ignored-rules__toggle');
	}

	function setLanguageAndMoveFocus(language: string, trigger: HTMLButtonElement): void {
		void runRemovingAction(trigger, () => onSetLanguage(language), '#linter-panel-tab');
	}
</script>

{#if sortedDiagnostics.length === 0}
	<div class="empty-state diagnostic-list__empty">
		<p class="diagnostic-list__empty-title">{emptyState.title}</p>
		<p>{emptyState.detail}</p>
		{@render emptyActions?.()}
	</div>
{:else}
	<ol bind:this={list} class="diagnostic-list" aria-label="Document diagnostics">
		{#each sortedDiagnostics as diagnostic, index (`${cardKey(diagnostic)}-${index}`)}
			{@const expanded = cardKey(diagnostic) === expandedKey}
			<li
				data-diagnostic-key={cardKey(diagnostic)}
				class:diagnostic-error={diagnostic.severity === 'error'}
				class:diagnostic-card--expanded={expanded}
				class:diagnostic-card--active={cardKey(diagnostic) === activeDiagnosticKey}
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
					<DiagnosticMeta {diagnostic} {sources} line={lineFor?.(diagnostic.from)} />
				</div>
				{#if expanded}
					<DiagnosticDetails
						{diagnostic}
						onChooseHeader={() => onChooseHeader(diagnostic)}
						onAssignPerformers={canAssignPerformers(diagnostic)
							? () => onAssignPerformers(diagnostic)
							: undefined}
						onSetLanguage={setLanguageAndMoveFocus}
						onPreviewFix={(fix) => onPreviewFix(diagnostic, fix)}
						{onCancelPreview}
						onApplyFix={(fix) => onApplyFix(diagnostic, fix)}
						fixBatchSize={fixBatchSize ? (fix) => fixBatchSize(diagnostic, fix) : undefined}
						onApplyFixBatch={onApplyFixBatch
							? (fix) => onApplyFixBatch(diagnostic, fix)
							: undefined}
						onIgnore={(trigger) => ignoreAndMoveFocus(diagnostic, trigger)}
					/>
				{/if}
			</li>
		{/each}
	</ol>
{/if}
