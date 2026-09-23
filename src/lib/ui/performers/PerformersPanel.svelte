<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import PerformerLegend from './PerformerLegend.svelte';
	import PerformerRoster from './PerformerRoster.svelte';

	let { controller, active = true }: { controller: WorkbenchController; active?: boolean } =
		$props();
</script>

<div class="panel-content performers-panel">
	<PerformerRoster {controller} />

	{#if controller.rosterSuggestions.length > 0}
		<section class="merge-suggestions" aria-label="Performer merge suggestions">
			<h2>Possible duplicates</h2>
			<p>Review these names. LyricLint never merges them automatically.</p>
			<ul>
				{#each controller.rosterSuggestions as suggestion (`${suggestion.sourceId}-${suggestion.targetId}`)}
					<li>
						<span>{suggestion.sourceName} and {suggestion.targetName}</span>
						<button
							type="button"
							class="button button--quiet"
							onclick={() => controller.mergePerformers(suggestion.sourceId, suggestion.targetId)}
						>
							Merge into {suggestion.targetName}
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<PerformerLegend
		document={controller.snapshot.parsed}
		performers={controller.performers}
		{active}
	/>
</div>

<style>
	/* The roster stays directly editable; occasional reference material opens
	   in place with the same quiet row rhythm as Preferences. Global because the
	   legend's heading is drawn by `PerformerLegend.svelte`. */
	.performers-panel :global(h2) {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-ui);
	}

	.merge-suggestions {
		margin-top: var(--space-5);
	}

	.merge-suggestions ul {
		display: grid;
		margin: 0;
		padding-inline-start: var(--space-5);
		gap: var(--space-3);
	}

	.merge-suggestions li {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		justify-content: space-between;
	}
</style>
