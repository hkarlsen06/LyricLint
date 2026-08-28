<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import PerformerLegend from './PerformerLegend.svelte';
	import PerformerRoster from './PerformerRoster.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
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

	<PerformerLegend document={controller.snapshot.parsed} performers={controller.performers} />
</div>
