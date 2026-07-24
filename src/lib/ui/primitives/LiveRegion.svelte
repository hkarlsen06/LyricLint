<script lang="ts">
	import type { FeedbackState } from '../state/feedback.svelte.js';

	let { feedback }: { feedback: FeedbackState } = $props();
</script>

<div class="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-region">
	{#key feedback.announcementId}
		<span>{feedback.announcement}</span>
	{/key}
</div>
