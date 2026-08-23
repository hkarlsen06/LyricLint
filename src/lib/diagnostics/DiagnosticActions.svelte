<script lang="ts">
	// Decision record: docs/subsystems/diagnostics.md — read it before changing
	// this file, and update it with any behavior change.
	import { untrack } from 'svelte';
	import { Check } from 'lucide-svelte';
	import { previewableFix, previewSignature } from '$lib/core/fix-preview.js';
	import type { Diagnostic, DiagnosticFix } from '$lib/core/types.js';
	import { describeControl } from '$lib/ui/state/control-tooltip.svelte.js';
	import { acceptsDiagnosticAsCorrect } from './ignore.js';
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
	 * predicate is shared with the key the answer is stored under and the toast
	 * that reports it, so the three cannot come to disagree about which question
	 * this row asked.
	 */
	const acceptsAsCorrect = $derived(acceptsDiagnosticAsCorrect(diagnostic));
	const isUnresolvedUnknown = $derived(diagnostic.ruleId === 'unknown.unresolved');
	/**
	 * Where the acceptance is drawn, which is the one thing the two shapes of it
	 * differ by. An unresolved lyric's answer stands in the ignore slot — that is
	 * where a reader looks for the way out of a finding with no fix — so it never
	 * leads the row, and the quiet `Ignore` is what it replaces.
	 *
	 * Leading, it takes the surface's one contrast tier, so a fix beside it steps
	 * down to bordered the way `Fix all N` does beside the change it repeats.
	 */
	const leadsWithAccept = $derived(acceptsAsCorrect && !isUnresolvedUnknown);
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
	 * The row is where its keyboard twins are learned, and the pointer is who
	 * they are taught to: this is the most-pressed surface in the workbench, the
	 * pointer crosses a control here on every press, and the shared box arrives
	 * with the keystroke at exactly that moment — which no legend or one-shot tip
	 * can match. Printed as pressed, the action tray's own idiom
	 * (`EditorActions.svelte`). The box repeats the visible label on purpose: the
	 * label is the accessible name, the keystroke is `aria-keyshortcuts`, and the
	 * box is `aria-hidden`, so nothing announces twice.
	 */
	const mac = 'navigator' in globalThis && /Mac|iPhone|iPad|iPod/iu.test(navigator.platform);
	const chooseHeaderKeys = {
		caption: mac ? '⇧⌘H' : 'Ctrl+Shift+H',
		keyshortcuts: mac ? 'Meta+Shift+H' : 'Control+Shift+H'
	};
	const assignPerformersKeys = {
		caption: mac ? '⌃⌥P' : 'Ctrl+Alt+P',
		keyshortcuts: 'Control+Alt+P'
	};
	/**
	 * `Mod-.` selects the nearest fixable finding and lands focus on this row, so
	 * the disclosure rides the leading fix — the one that press reaches. And with
	 * focus already here, the same keystroke *applies*: the box over the focused
	 * control names `⌘.` as its own press, so a second `⌘.` that only re-opened
	 * the popover would be the disclosure exposed as a lie by the very keystroke
	 * it teaches. Pressed again after that, the selection has moved on and the
	 * window's binding reaches the next finding — so the whole panel is walked
	 * one chord at a time.
	 */
	const openFixKeys = {
		caption: mac ? '⌘.' : 'Ctrl+.',
		keyshortcuts: mac ? 'Meta+.' : 'Control+.'
	};

	/**
	 * The second press, bound on the control that claims the keystroke rather
	 * than at the window, so it holds wherever this row renders — the panel
	 * card, the popover, and the landing page's demo, which opts out of the
	 * window binding entirely. The window's own `Mod-.` listener stands down for
	 * a press landing on a claimant (`create-editor.ts`), which is what keeps
	 * this the one implementation of "apply".
	 */
	function applyOnOwnShortcut(fix: DiagnosticFix): (event: KeyboardEvent) => void {
		return (event) => {
			const modifier = mac ? event.metaKey : event.ctrlKey;
			if (event.key !== '.' || !modifier || event.altKey || event.shiftKey) return;
			event.preventDefault();
			event.stopPropagation();
			onApplyFix(fix);
		};
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
	{#if leadsWithAccept}
		<button
			type="button"
			class="button button--contrast diagnostic-actions__accept"
			onclick={(event) => onIgnore(event.currentTarget)}
		>
			It's correct
			<Check aria-hidden="true" size={14} strokeWidth={2.4} />
		</button>
	{/if}
	{#if offersHeaderPicker}
		<button
			type="button"
			class="button button--contrast diagnostic-actions__guided"
			aria-keyshortcuts={chooseHeaderKeys.keyshortcuts}
			onclick={onChooseHeader}
			{@attach describeControl(() => ({
				label: 'Choose header',
				shortcut: chooseHeaderKeys.caption
			}))}
		>
			Choose header
		</button>
	{/if}
	{#if onAssignPerformers}
		<button
			type="button"
			class="button diagnostic-actions__guided"
			aria-keyshortcuts={assignPerformersKeys.keyshortcuts}
			onclick={onAssignPerformers}
			{@attach describeControl(() => ({
				label: 'Assign section performers',
				shortcut: assignPerformersKeys.caption
			}))}
		>
			Assign section performers
		</button>
	{/if}
	{#if offersSectionLink}
		<!-- No keyboard twin to name: `Mod-Shift-L` arms Type only here now, and
		     the picker's ways in are the pointer's own — this action and the `⇄`
		     marker. A box that only repeated the label would be the label twice. -->
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
	<!-- A surface has one contrast action, and a diagnostic can carry several
	     fixes — Harper offers up to three, and `ur` alone emits two. Drawn a tier
	     each they were three answers shouting equally in the one place the reader
	     is choosing *between* them, and the ranked lead fix lost the precedence
	     the ordering had just given it. Only the first takes the tier; the rest
	     are bordered alternatives beside it. -->
	{#each diagnostic.fixes ?? [] as fix, index (`${fix.kind}:${fix.label}`)}
		{@const batch = batchCount(fix)}
		<!-- Only the leading fix names `Mod-.`, because it is the one that keystroke
		     lands on; an alternate wearing the same caption would promise a key that
		     reaches its sibling. -->
		<button
			type="button"
			class="button diagnostic-actions__fix"
			class:button--contrast={index === 0 && !offersHeaderPicker && !leadsWithAccept}
			aria-keyshortcuts={index === 0 ? openFixKeys.keyshortcuts : undefined}
			onpointerenter={() => showFix(fix)}
			onfocus={() => showFix(fix)}
			onclick={() => onApplyFix(fix)}
			onkeydown={index === 0 ? applyOnOwnShortcut(fix) : undefined}
			{@attach describeControl(() =>
				index === 0 ? { label: fix.label, shortcut: openFixKeys.caption } : undefined
			)}
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
	{#if !leadsWithAccept}
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
