<script lang="ts">
	import { prefersReducedMotion } from '$lib/interaction/motion.js';
	import { fly } from 'svelte/transition';
	import { X } from 'lucide-svelte';
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
					<X aria-hidden="true" size={16} strokeWidth={2.25} />
				</button>
			</div>
		</div>
	{/each}
</section>
