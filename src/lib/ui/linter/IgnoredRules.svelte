<script lang="ts">
	import { tick } from 'svelte';
	import {
		ignoredDiagnosticAccepted,
		ignoredDiagnosticRuleId,
		ignoredDiagnosticText
	} from '$lib/diagnostics/ignore.js';
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

	const rows = $derived(
		diagnosticKeys.map((key) => ({
			key,
			name: ruleName(ignoredDiagnosticRuleId(key)),
			flagged: ignoredDiagnosticText(key),
			accepted: ignoredDiagnosticAccepted(key)
		}))
	);
	const acceptedCount = $derived(rows.filter((row) => row.accepted).length);
	const ignoredCount = $derived(rows.length - acceptedCount);
	/**
	 * A row says which kind it is only where the footer holds both. With one kind
	 * the line above has already said it, and a word repeated down every row of a
	 * column is one nobody reads — the same reason the diagnostic card gave up
	 * printing its severity.
	 */
	const mixed = $derived(ignoredCount > 0 && acceptedCount > 0);

	function countOf(total: number): string {
		return `${total} ${total === 1 ? 'diagnostic' : 'diagnostics'}`;
	}

	// One suppression, two answers, and the summary states whichever of them this
	// footer actually holds: a count that could not have been otherwise is a count
	// worth leaving out, and a single number over both would name neither.
	const summary = $derived(
		ignoredCount === 0
			? `${countOf(acceptedCount)} marked as correct`
			: acceptedCount === 0
				? `${countOf(ignoredCount)} ignored`
				: `${countOf(ignoredCount)} ignored · ${acceptedCount} marked as correct`
	);

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
		<span>{summary}</span>
		<!-- The hint names what is behind the disclosure, not what this press does
		     — pressing it expands. `aria-hidden` rather than a reword, because the
		     button's own state is already carried by `aria-expanded` and a second
		     word in its accessible name would promise a restore it does not do. -->
		<span class="ignored-rules__restore-hint" aria-hidden="true">Show</span>
	</button>
	{#if expanded}
		<ul>
			{#each rows as row (row.key)}
				<li>
					<!-- An ignore is per occurrence, so one rule set aside twice is two
					     rows carrying the same name. The flagged text is what tells them
					     apart, and the key already holds it. The kind follows as one more
					     fact about the row, after an interpunct, in the meta-line idiom
					     the diagnostic card sets. -->
					<span
						>{row.name}{#if row.flagged}&nbsp;— “{row.flagged}”{/if}{#if mixed}<span
								class="ignored-rules__kind"
								>&nbsp;· {row.accepted ? 'Marked as correct' : 'Ignored'}</span
							>{/if}</span
					>
					<button
						type="button"
						class="button button--quiet"
						onclick={(event) => restoreAndMoveFocus(row.key, event.currentTarget)}
					>
						Restore
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>
