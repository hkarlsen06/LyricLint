<script lang="ts">
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import { fly } from 'svelte/transition';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import type { FeedbackState } from '../state/feedback.svelte.js';

	let { feedback }: { feedback: FeedbackState } = $props();

	const reducedMotion = prefersReducedMotion();
	// The region stands above the footer, so a toast rises into place from it.
	const motion = { y: 6, duration: reducedMotion ? 0 : 150 };

	function stillEngaged(toast: HTMLElement, next: EventTarget | null): boolean {
		if (next instanceof Node && toast.contains(next)) return true;
		return toast.matches(':hover') || toast.contains(document.activeElement);
	}

	function release(id: string, toast: HTMLElement, next: EventTarget | null): void {
		if (!stillEngaged(toast, next)) feedback.resumeToast(id);
	}
</script>

<section class="toast-region" aria-label="Notifications">
	{#each feedback.toasts as toast (toast.id)}
		<div
			class="toast"
			role="group"
			aria-label="Notification"
			transition:fly={motion}
			onmouseenter={() => feedback.pauseToast(toast.id)}
			onmouseleave={(event) => release(toast.id, event.currentTarget, event.relatedTarget)}
			onfocusin={() => feedback.pauseToast(toast.id)}
			onfocusout={(event) => release(toast.id, event.currentTarget, event.relatedTarget)}
		>
			{#if (toast.count ?? 1) > 1}
				<span class="toast__count" role="img" aria-label="{toast.count} times">{toast.count}</span>
			{/if}
			<p>{toast.message}</p>
			<div class="toast__actions">
				{#if toast.action && toast.actionLabel}
					<button
						type="button"
						class="button button--quiet"
						onclick={() => feedback.runToastAction(toast.id)}
					>
						{toast.actionLabel}
					</button>
				{/if}
				<button
					type="button"
					class="icon-button button--quiet"
					aria-label="Dismiss notification"
					onclick={() => feedback.dismissToast(toast.id)}
				>
					<XIcon aria-hidden="true" size={16} weight="bold" />
				</button>
			</div>
		</div>
	{/each}
</section>

<style>
	/* Centred just above the window's foot, where the notification stays close to
	   the action that raised it without covering the document it reports on. Equal
	   inline insets plus auto margins do the centring rather than a transform: the
	   fly transition owns `transform` while a toast enters or leaves.

	   The transport stands between the two whenever audio is attached, and a toast
	   drawn over it covers the row a transcriber is operating. The loop is listen,
	   pause, type, and nearly everything that raises a toast happens in the middle
	   of it. So the strip's height joins the offset while the strip is drawn.
	   `--media-strip-height` is published by the row itself (`MediaStrip.svelte`),
	   because it is not a constant and this region is fixed and nowhere near it in
	   the tree; absent, the toast rides the foot it shares with the strip and the
	   composer. */
	.toast-region {
		position: fixed;
		z-index: var(--layer-toast);
		right: var(--space-3);
		bottom: calc(var(--media-strip-height, 0px) + var(--space-2));
		left: var(--space-3);
		display: grid;
		width: min(25rem, calc(100vw - 2rem));
		margin-inline: auto;
		gap: var(--space-2);
		pointer-events: none;
	}

	/*
	 * The toasts ride above the strip, wherever the strip is.
	 *
	 * `.toast-region` clears the transport by adding the row's own published height
	 * to the status bar's, which is the right sum only while the strip is in the
	 * flow above that bar. Once a software keyboard is up the strip has left it,
	 * so the same offset would put a toast under the keyboard, invisible, on the one
	 * device where the notice is most likely the only thing reporting what just
	 * happened.
	 *
	 * `--keyboard-top` is the strip's *bottom* edge, so the row's height is added
	 * again to clear its top. The percentage resolves against the layout viewport,
	 * which is what a fixed element's offsets are measured from and what
	 * `--keyboard-top` is expressed in, the same coordinate space `.workspace::after`
	 * pins its own top to.
	 */
	:global(:root[data-keyboard-inset]) .toast-region {
		bottom: calc(100% - var(--keyboard-top) + var(--media-strip-height, 0px) + var(--space-2));
	}
</style>
