<script lang="ts">
	import type { RetainedFinding } from '#lib/conversion/review.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	let {
		controller,
		findings
	}: { controller: WorkbenchController; findings: readonly RetainedFinding[] } = $props();
	let selected = $state(0);
	const position = $derived(Math.min(selected, findings.length - 1));
	const current = $derived(findings[position]);
</script>

{#if findings.length}
	<section class="retained-review" aria-label="Retained details needing review">
		<h2>Retained details ({findings.length})</h2>
		<ul>
			{#each current ? [current] : [] as finding (finding.id)}
				<li>
					<div class="retained-review__message">
						{#each findings as item (item.id)}<p
								class="retained-review__measure"
								aria-hidden="true"
							>
								{item.message}
							</p>{/each}
						<p aria-live="polite">{finding.message}</p>
					</div>
					<button
						type="button"
						class="button button--quiet"
						onclick={() => controller.openSectionDetails(finding.sectionId ?? 'new', 'review')}
						>Review in Song</button
					>
				</li>
			{/each}
		</ul>
		{#if findings.length > 1}<div class="tool-actions">
				<button
					type="button"
					class="button button--quiet"
					disabled={position <= 0}
					onclick={() => (selected = position - 1)}>Previous detail</button
				>
				<span>{position + 1} of {findings.length}</span>
				<button
					type="button"
					class="button button--quiet"
					disabled={position >= findings.length - 1}
					onclick={() => (selected = position + 1)}>Next detail</button
				>
			</div>{/if}
	</section>
{/if}

<style>
	.retained-review__message {
		display: grid;
	}
	.retained-review__message p {
		grid-area: 1 / 1;
		overflow-wrap: anywhere;
	}
	.retained-review__measure {
		visibility: hidden;
	}

	.retained-review {
		padding: var(--space-4);
	}
	.retained-review h2 {
		font-size: var(--font-size-md);
	}
	.retained-review ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.retained-review li {
		padding-block: var(--space-2);
	}
	.retained-review p {
		margin-block: 0 var(--space-1);
	}
</style>
