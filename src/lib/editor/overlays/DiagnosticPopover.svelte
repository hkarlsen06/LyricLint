<script lang="ts">
	import { tick } from 'svelte';
	import type { Diagnostic, DiagnosticFix, SourceReference } from '$lib/core/types.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import DiagnosticActions from '$lib/diagnostics/DiagnosticActions.svelte';
	import DiagnosticSources from '$lib/diagnostics/DiagnosticSources.svelte';
	import SeverityTag from '$lib/diagnostics/SeverityTag.svelte';
	import type { ScreenRect } from '../contracts.js';

	interface Props {
		diagnostic: Diagnostic;
		sources?: readonly SourceReference[];
		anchor?: ScreenRect;
		takeFocus?: boolean;
		onPreviewFix: (fix: DiagnosticFix) => void;
		onCancelPreview: () => void;
		onApplyFix: (fix: DiagnosticFix) => void;
		onChooseHeader?: () => void;
		onAssignPerformers?: () => void;
		onIgnore: () => void;
		/**
		 * `heldFocus` reports whether the popover still owned focus when it closed.
		 * A hovered card that the pointer simply left never did, and handing focus
		 * back to the editor for that would move the caret the user never touched.
		 */
		onDismiss?: (heldFocus: boolean) => void;
	}

	let {
		diagnostic,
		sources = [],
		anchor,
		takeFocus = false,
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		onChooseHeader,
		onAssignPerformers,
		onIgnore,
		onDismiss = () => {}
	}: Props = $props();
	let root: HTMLDivElement;
	const position = $derived(
		anchor
			? `left: ${Math.max(8, anchor.left)}px; top: ${Math.max(8, anchor.bottom + 6)}px;`
			: undefined
	);

	$effect(() => {
		if (!takeFocus) {
			return;
		}
		const diagnosticAtOpen = diagnostic;
		void tick().then(() => {
			if (diagnostic !== diagnosticAtOpen) {
				return;
			}
			// Only a constructive action is worth landing on: opening a card with
			// the keyboard must never put Enter over Ignore. A diagnostic with
			// nothing to do about it focuses the card itself, to be read.
			const firstAction = root?.querySelector<HTMLButtonElement>(
				'.diagnostic-actions__guided, .diagnostic-actions__fix'
			);
			(firstAction ?? root)?.focus();
		});
	});

	function dismiss(): void {
		onDismiss(root?.contains(document.activeElement) ?? false);
	}

	/**
	 * `Close` is offered only to the card that was opened with the keyboard. That
	 * one holds focus and is deliberately exempt from the pointer-leave watcher,
	 * so without a visible control its only exit is a keystroke nobody announced.
	 * The hovered card has no such gap — moving away closes it — and a second
	 * quiet button there would only sit beside `Ignore` looking like it, while
	 * one of the two silences a rule for the rest of the session.
	 */
	const closingControl = $derived(takeFocus ? dismiss : undefined);

	// A press outside closes the card whether it was opened by hover or by
	// keyboard, and never reports held focus: the press itself is where focus
	// belongs now, so the editor must not pull the caret back.
	function dismissFromOutsidePress(): void {
		onDismiss(false);
	}

	// Hovering an underline is what opens this card, so the pointer leaving both
	// the card and its underline is what closes it again. A grace margin plus a
	// short delay keeps the diagonal travel from underline to popover from
	// closing it early. Keyboard-opened popovers (takeFocus) are unaffected, and
	// a popover the user has tabbed into is never closed out from under focus.
	$effect(() => {
		if (takeFocus) {
			return;
		}
		let timer: number | undefined;
		const margin = 28;
		const within = (
			rect: { left: number; right: number; top: number; bottom: number },
			x: number,
			y: number,
			pad: number
		) =>
			x >= rect.left - pad &&
			x <= rect.right + pad &&
			y >= rect.top - pad &&
			y <= rect.bottom + pad;
		const onMove = (event: PointerEvent) => {
			const rect = root?.getBoundingClientRect();
			if (!rect) {
				return;
			}
			const near =
				within(rect, event.clientX, event.clientY, margin) ||
				(anchor !== undefined && within(anchor, event.clientX, event.clientY, 12));
			if (near) {
				if (timer !== undefined) {
					clearTimeout(timer);
					timer = undefined;
				}
			} else if (timer === undefined) {
				timer = window.setTimeout(() => {
					if (!root?.contains(document.activeElement)) {
						onDismiss(false);
					}
				}, 250);
			}
		};
		window.addEventListener('pointermove', onMove, { passive: true });
		return () => {
			window.removeEventListener('pointermove', onMove);
			if (timer !== undefined) {
				clearTimeout(timer);
			}
		};
	});
</script>

<div
	bind:this={root}
	class="popover"
	class:anchored={anchor}
	style={position}
	role={takeFocus ? 'dialog' : undefined}
	tabindex="-1"
	aria-label="Diagnostic details"
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			dismiss();
		}
	}}
	{@attach dismissOnOutside(dismissFromOutsidePress)}
>
	<!-- Same tag, same wording, same order as the card in the linter panel: the
	     finding under the pointer is recognisably the one listed in the panel. -->
	<div class="heading">
		<SeverityTag severity={diagnostic.severity} />
		<strong>{diagnostic.message}</strong>
		<p class="diagnostic-explanation">{diagnostic.explanation}</p>
	</div>

	<DiagnosticActions
		{diagnostic}
		{onChooseHeader}
		{onAssignPerformers}
		{onPreviewFix}
		{onCancelPreview}
		{onApplyFix}
		onIgnore={() => onIgnore()}
		onClose={closingControl}
	/>

	<DiagnosticSources sourceIds={diagnostic.sourceIds} {sources} />
</div>

<style>
	/* The card's chrome only. Everything inside it — heading tag, explanation,
	   action row, sources — is shared with the linter panel and styled with it
	   in `diagnostics.css`, so the two surfaces cannot drift apart. */
	.popover {
		display: grid;
		z-index: var(--layer-popover);
		box-sizing: border-box;
		width: min(26rem, calc(100vw - 1rem));
		max-height: min(26rem, calc(100vh - 1rem));
		padding: var(--space-3);
		gap: var(--space-3);
		align-content: start;
		overflow-y: auto;
		border: var(--border-width) solid var(--color-border);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
		font-family: var(--font-ui);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-regular);
		line-height: var(--line-height-body);
	}

	.anchored {
		position: fixed;
	}

	/* Severity tag above the message, exactly as the panel card stacks them. The
	   explanation belongs to this block, not to the next one: it is the message
	   continued, so it sits under it rather than a section away. */
	.heading {
		display: grid;
		gap: var(--space-1);
		justify-items: start;
	}

	strong {
		font-size: var(--font-size-md);
		line-height: var(--line-height-tight);
	}
</style>
