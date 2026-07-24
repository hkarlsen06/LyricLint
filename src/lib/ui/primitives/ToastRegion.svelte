<script lang="ts">
	import type { FeedbackState } from '../state/feedback.svelte.js';

	let { feedback }: { feedback: FeedbackState } = $props();
</script>

<section class="toast-region" aria-label="Notifications">
	{#each feedback.toasts as toast (toast.id)}
		<div class="toast">
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
					class="icon-button"
					aria-label="Dismiss notification"
					onclick={() => feedback.dismissToast(toast.id)}
				>
					×
				</button>
			</div>
		</div>
	{/each}
</section>
