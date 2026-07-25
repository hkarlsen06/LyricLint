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
	let toggle: HTMLButtonElement | null = $state(null);

	// Restoring the last ignored rule takes the whole footer away with it, so the
	// toggle we would normally return focus to may be gone by the time the DOM
	// settles. The restored diagnostics are back in the list above, so that is
	// where focus goes instead.
	async function restoreAndMoveFocus(ruleId: string, trigger: HTMLButtonElement): Promise<void> {
		const nextRestore = trigger
			.closest('li')
			?.nextElementSibling?.querySelector<HTMLButtonElement>('button');
		const panel = trigger.closest('.right-panel');
		onRestore(ruleId);
		await tick();
		if (nextRestore?.isConnected) {
			nextRestore.focus();
		} else if (toggle?.isConnected) {
			toggle.focus();
		} else {
			panel?.querySelector<HTMLButtonElement>('.diagnostic-list__navigate')?.focus();
		}
	}
</script>

<section class="ignored-rules">
	<button
		type="button"
		class="ignored-rules__toggle"
		bind:this={toggle}
		aria-expanded={expanded}
		onclick={() => (expanded = !expanded)}
	>
		<span>{ruleIds.length} {ruleIds.length === 1 ? 'rule' : 'rules'} ignored</span>
		<span class="ignored-rules__restore-hint">Restore</span>
	</button>
	{#if expanded}
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
</section>
