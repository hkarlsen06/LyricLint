<script lang="ts">
	let {
		ruleIds,
		onRestore
	}: {
		ruleIds: readonly string[];
		onRestore: (ruleId: string) => void;
	} = $props();

	let expanded = $state(false);
</script>

<section class="ignored-rules">
	<button
		type="button"
		class="ignored-rules__toggle"
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		<span>Ignored rules</span>
		<span>{ruleIds.length}</span>
	</button>
	{#if expanded}
		{#if ruleIds.length === 0}
			<p class="empty-state">No rules are ignored for this draft.</p>
		{:else}
			<ul>
				{#each ruleIds as ruleId (ruleId)}
					<li>
						<code>{ruleId}</code>
						<button type="button" class="button button--quiet" onclick={() => onRestore(ruleId)}>
							Restore
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>
