<script lang="ts">
	import { untrack } from 'svelte';
	import { previewableFix, previewSignature } from '$lib/core/fix-preview.js';
	import type { Diagnostic, DiagnosticFix } from '$lib/core/types.js';

	interface Props {
		diagnostic: Diagnostic;
		/** Offered for a headerless section when the host can open the picker. */
		onChooseHeader?: () => void;
		/** Offered only when the document can actually take the assignment. */
		onAssignPerformers?: () => void;
		onPreviewFix: (fix: DiagnosticFix) => void;
		onCancelPreview: () => void;
		onApplyFix: (fix: DiagnosticFix) => void;
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
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		onIgnore,
		onClose
	}: Props = $props();

	const isUnrecognizedHeaderReview = $derived(diagnostic.ruleId === 'section.header-unrecognized');
	const offersHeaderPicker = $derived(
		diagnostic.ruleId === 'section.header-missing' && onChooseHeader !== undefined
	);
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
		untrack(() => onPreviewFix(fix));
		return () => untrack(() => onCancelPreview());
	});

	// Only one fix can sit in the document at a time, so reaching for a fix moves
	// the preview onto it before it can be applied.
	function showFix(fix: DiagnosticFix): void {
		onPreviewFix(fix);
	}
</script>

<div class="diagnostic-actions">
	{#if offersHeaderPicker}
		<button type="button" class="button diagnostic-actions__guided" onclick={onChooseHeader}>
			Choose header
		</button>
	{/if}
	{#if onAssignPerformers}
		<button type="button" class="button diagnostic-actions__guided" onclick={onAssignPerformers}>
			Assign section performers
		</button>
	{/if}
	<!-- The fix names itself. "Apply" in front of a label that already reads as a
	     command ("Apply Replace with Don't") says the same thing twice, so the
	     button is the label and nothing else. -->
	{#each diagnostic.fixes ?? [] as fix (`${fix.kind}:${fix.label}`)}
		<button
			type="button"
			class="button button--contrast diagnostic-actions__fix"
			onpointerenter={() => showFix(fix)}
			onfocus={() => showFix(fix)}
			onclick={() => onApplyFix(fix)}
		>
			{fix.label}
		</button>
	{/each}
	{#if isUnrecognizedHeaderReview}
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
	{:else}
		<button
			type="button"
			class="button button--quiet diagnostic-actions__ignore"
			onclick={(event) => onIgnore(event.currentTarget)}
		>
			Ignore
		</button>
	{/if}
	{#if onClose}
		<button type="button" class="button button--quiet diagnostic-actions__close" onclick={onClose}>
			Close
		</button>
	{/if}
</div>
