<script lang="ts">
	import type { RetainedFinding } from '$lib/conversion/review.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	let {
		controller,
		findings
	}: { controller: WorkbenchController; findings: readonly RetainedFinding[] } = $props();
</script>

{#if findings.length}
	<section class="retained-review" aria-label="Retained details needing review">
		<h2>Retained details ({findings.length})</h2>
		<ul>
			{#each findings as finding (finding.id)}
				<li>
					<p>{finding.message}</p>
					<button
						type="button"
						class="button button--quiet"
						onclick={() => controller.openSectionDetails(finding.sectionId ?? 'new')}
						>Review in Song</button
					>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
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
