<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	let { controller }: { controller: WorkbenchController } = $props();
	const source = $derived(
		controller.snapshot.clipboardReview?.sourceProfile === 'musixmatch' ? 'Musixmatch' : 'Genius'
	);
	const target = $derived(controller.profile === 'musixmatch' ? 'Musixmatch' : 'Genius');
</script>

{#if controller.snapshot.clipboardReview}
	<section>
		<h2>Passage format preview</h2>
		<p>
			Interpret this passage as {source}, then apply {target} formatting and retained details. Review
			the resulting lyrics below.
		</p>
		<pre aria-label={`${target} passage preview`}>{controller.snapshot.clipboardReview
				.previewText}</pre>
		<div class="tool-actions">
			<button type="button" class="button" onclick={() => controller.applyClipboardReview()}
				>Apply as {target}</button
			>
			<button
				type="button"
				class="button button--quiet"
				onclick={() => controller.dismissClipboardReview()}>Keep current text</button
			>
		</div>
	</section>
{/if}

<style>
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-size: inherit;
	}
</style>
