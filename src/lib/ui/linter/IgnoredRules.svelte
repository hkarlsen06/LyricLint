<script lang="ts">
	import { tick } from 'svelte';
	import { ignoredDiagnosticRuleId } from '$lib/diagnostics/ignore.js';
	import { ruleName } from '$lib/rules/index.js';

	let {
		diagnosticKeys,
		onRestore
	}: {
		diagnosticKeys: readonly string[];
		onRestore: (diagnosticKey: string) => void;
	} = $props();

	let expanded = $state(false);
	let toggle: HTMLButtonElement | null = $state(null);

	// Restoring the last ignored rule takes the whole footer away with it, so the
	// toggle we would normally return focus to may be gone by the time the DOM
	// settles. The restored diagnostics are back in the list above, so that is
	// where focus goes instead.
	async function restoreAndMoveFocus(key: string, trigger: HTMLButtonElement): Promise<void> {
		const nextRestore = trigger
			.closest('li')
			?.nextElementSibling?.querySelector<HTMLButtonElement>('button');
		const panel = trigger.closest('.right-panel');
		onRestore(key);
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
		<span
			>{diagnosticKeys.length}
			{diagnosticKeys.length === 1 ? 'diagnostic' : 'diagnostics'} ignored</span
		>
		<span class="ignored-rules__restore-hint">Restore</span>
	</button>
	{#if expanded}
		<ul>
			{#each diagnosticKeys as key (key)}
				<li>
					<span>{ruleName(ignoredDiagnosticRuleId(key))}</span>
					<button
						type="button"
						class="button button--quiet"
						onclick={(event) => restoreAndMoveFocus(key, event.currentTarget)}
					>
						Restore
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
