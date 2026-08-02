<script lang="ts">
	import { untrack } from 'svelte';
	import { previewableFix, previewSignature } from '$lib/core/fix-preview.js';
	import type { Diagnostic, DiagnosticFix } from '$lib/core/types.js';
	import { acquirePreview } from './preview-slot.js';

	interface Props {
		diagnostic: Diagnostic;
		/** Offered for a headerless section when the host can open the picker. */
		onChooseHeader?: () => void;
		/** Offered only when the document can actually take the assignment. */
		onAssignPerformers?: () => void;
		/** Offered for repeated sections when the host can open the link picker. */
		onLinkSections?: () => void;
		/** Offered when the diagnostic carries a detected language the host can select. */
		onSetLanguage?: (language: string, trigger: HTMLButtonElement) => void;
		onPreviewFix: (fix: DiagnosticFix) => void;
		onCancelPreview: () => void;
		onApplyFix: (fix: DiagnosticFix) => void;
		/**
		 * How many findings this exact fix would settle, counting this one. Both
		 * surfaces ask the shell, which plans the batch against the diagnostics the
		 * panel is showing — neither a card nor a popover can see the document.
		 */
		fixBatchSize?: (fix: DiagnosticFix) => number;
		onApplyFixBatch?: (fix: DiagnosticFix) => void;
		/** The trigger comes back so a host can move focus off the row it removes. */
		onIgnore: (trigger: HTMLButtonElement) => void;
		/** A transient surface passes its own closing control; a card in the panel
		 *  is closed by collapsing it, so it passes nothing. */
		onClose?: () => void;
	}

	let {
		diagnostic,
		onChooseHeader,
		onAssignPerformers,
		onLinkSections,
		onSetLanguage,
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		fixBatchSize,
		onApplyFixBatch,
		onIgnore,
		onClose
	}: Props = $props();

	/**
	 * The finding whose likeliest answer is that the text is already right. The
	 * quiet `Ignore` is replaced by an affirmative control, which leads the row
	 * and takes the surface's one contrast tier — so a fix beside it steps down
	 * to bordered, the way `Fix all N` does beside the change it repeats.
	 *
	 * A custom header is the whole of its rule; an ad-lib is one of the two
	 * findings its rule reports, which is why the second is carried on the
	 * diagnostic rather than named here by id.
	 */
	const acceptsAsCorrect = $derived(
		diagnostic.ruleId === 'section.header-unrecognized' || diagnostic.presumedCorrect === true
	);
	const isUnresolvedUnknown = $derived(diagnostic.ruleId === 'unknown.unresolved');
	// Two findings, one answer: a section with no header line, and a header line
	// with no name in it. Both are settled by choosing a reviewed header, and the
	// transform decides which of the two edits that is — a card that offered a
	// different control for each would be two ways to ask the same question.
	const offersHeaderPicker = $derived(
		(diagnostic.ruleId === 'section.header-missing' ||
			diagnostic.ruleId === 'section.header-empty') &&
			onChooseHeader !== undefined
	);
	// The picker, not the link itself: a batch that rewrites three sections is
	// worth seeing named before it runs, and the card has no room to show the
	// change as a diff the way a fix does. It also costs no second implementation
	// — this is the same card `Ctrl-Shift-L` opens, over the same group.
	const offersSectionLink = $derived(
		diagnostic.ruleId === 'section.unlinked-repeat' && onLinkSections !== undefined
	);
	const detectedLanguage = $derived(diagnostic.detectedLanguage);
	// Selecting the diagnostic is the preview: the editor shows the change as a
	// diff for as long as this row is mounted, so the only control needed is the
	// one that keeps it.
	const autoPreviewFix = $derived(previewableFix(diagnostic));
	const autoPreviewKey = $derived(previewSignature(autoPreviewFix));

	// Keyed on the edit's value, not the fix object, so a re-lint that produces
	// the same fix leaves the preview alone. The callbacks are untracked: both
	// hosts hand this row fresh closures on every render, and tracking them would
	// re-dispatch the preview for reasons unrelated to the fix.
	$effect(() => {
		if (!autoPreviewKey) {
			return;
		}
		const fix = untrack(() => autoPreviewFix);
		if (!fix) {
			return;
		}
		const show = () => untrack(() => onPreviewFix(fix));
		return acquirePreview(show, () => untrack(() => onCancelPreview()));
	});

	// Only one fix can sit in the document at a time, so reaching for a fix moves
	// the preview onto it before it can be applied.
	function showFix(fix: DiagnosticFix): void {
		onPreviewFix(fix);
	}

	/**
	 * The batch a fix offers, or nothing.
	 *
	 * The button appears only above one occurrence, and only for a fix the whole
	 * document can take unreviewed. The diff on screen is the user's evidence for
	 * pressing it, which is why the batch is this exact change repeated and not
	 * everything the rule found: a `preview` fix has no such standing, and a
	 * lone occurrence is already what the button beside it does.
	 */
	function batchCount(fix: DiagnosticFix): number {
		if (fix.kind !== 'safe' || !fixBatchSize || !onApplyFixBatch) return 0;
		const size = fixBatchSize(fix);
		return size > 1 ? size : 0;
	}
</script>

<div class="diagnostic-actions">
	{#if acceptsAsCorrect}
		<button
			type="button"
			class="button button--contrast diagnostic-actions__accept"
			onclick={(event) => onIgnore(event.currentTarget)}
		>
			It's correct
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				width="14"
				height="14"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3.5 8.2 6.5 11l6-6" />
			</svg>
		</button>
	{/if}
	{#if offersHeaderPicker}
		<button
			type="button"
			class="button button--contrast diagnostic-actions__guided"
			onclick={onChooseHeader}
		>
			Choose header
		</button>
	{/if}
	{#if onAssignPerformers}
		<button type="button" class="button diagnostic-actions__guided" onclick={onAssignPerformers}>
			Assign section performers
		</button>
	{/if}
	{#if offersSectionLink}
		<button type="button" class="button diagnostic-actions__guided" onclick={onLinkSections}>
			Manage linking
		</button>
	{/if}
	{#if detectedLanguage && onSetLanguage}
		<button
			type="button"
			class="button button--contrast diagnostic-actions__language"
			onclick={(event) => onSetLanguage(detectedLanguage.tag, event.currentTarget)}
		>
			Set language to {detectedLanguage.displayName}
		</button>
	{/if}
	<!-- The fix names itself. "Apply" in front of a label that already reads as a
	     command ("Apply Replace with Don't") says the same thing twice, so the
	     button is the label and nothing else. -->
	{#each diagnostic.fixes ?? [] as fix (`${fix.kind}:${fix.label}`)}
		{@const batch = batchCount(fix)}
		<button
			type="button"
			class="button diagnostic-actions__fix"
			class:button--contrast={!offersHeaderPicker && !acceptsAsCorrect}
			onpointerenter={() => showFix(fix)}
			onfocus={() => showFix(fix)}
			onclick={() => onApplyFix(fix)}
		>
			{fix.label}
		</button>
		<!-- Read against the button it follows, which already names the change and
		     is previewing it in the document: "Replace with I'ma · Fix all 3". The
		     count is the only new fact, so repeating the word here would just be
		     the label twice. It steps down a tier because the contrast action on a
		     surface is one, and the single reviewed fix is the one the diff is
		     actually showing. -->
		{#if batch > 0}
			<button
				type="button"
				class="button diagnostic-actions__fix-all"
				onpointerenter={() => showFix(fix)}
				onfocus={() => showFix(fix)}
				onclick={() => onApplyFixBatch?.(fix)}
			>
				Fix all {batch}
			</button>
		{/if}
	{/each}
	{#if !acceptsAsCorrect}
		<button
			type="button"
			class={isUnresolvedUnknown
				? 'button button--contrast'
				: 'button button--quiet diagnostic-actions__ignore'}
			onclick={(event) => onIgnore(event.currentTarget)}
		>
			{isUnresolvedUnknown ? 'It really is unintelligible' : 'Ignore'}
		</button>
	{/if}
	{#if onClose}
		<button type="button" class="button button--quiet diagnostic-actions__close" onclick={onClose}>
			Close
		</button>
	{/if}
</div>
