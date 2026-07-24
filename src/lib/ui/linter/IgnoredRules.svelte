<script lang="ts">
	import { tick } from 'svelte';

	let {
		ruleIds,
		onRestore
	}: {
		ruleIds: readonly string[];
		onRestore: (ruleId: string) => void;
	} = $props();

	let expanded = $state(false);
	let toggle: HTMLButtonElement;

	async function restoreAndMoveFocus(ruleId: string, trigger: HTMLButtonElement): Promise<void> {
		const nextRestore = trigger
			.closest('li')
			?.nextElementSibling?.querySelector<HTMLButtonElement>('button');
		onRestore(ruleId);
		await tick();
		if (nextRestore?.isConnected) {
			nextRestore.focus();
		} else {
			toggle.focus();
		}
	}
</script>

<section class="ignored-rules" class:ignored-rules--empty={ruleIds.length === 0}>
	<button
		type="button"
		class="ignored-rules__toggle"
		bind:this={toggle}
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		{#if ruleIds.length === 0}
			<span>No rules ignored this session</span>
		{:else}
			<span>{ruleIds.length} {ruleIds.length === 1 ? 'rule' : 'rules'} ignored</span>
			<span class="ignored-rules__restore-hint">· Restore</span>
		{/if}
	</button>
	{#if expanded}
		{#if ruleIds.length === 0}
			<p class="empty-state">No rules are ignored for this draft.</p>
		{:else}
			<ul>
				{#each ruleIds as ruleId (ruleId)}
					<li>
						<code>{ruleId}</code>
						<button
							type="button"
							class="button button--quiet"
							onclick={(event) => restoreAndMoveFocus(ruleId, event.currentTarget)}
						>
							Restore
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>
