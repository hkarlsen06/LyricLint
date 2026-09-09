<script lang="ts">
	import { tick } from 'svelte';
	import type { Diagnostic, EditorSnapshot } from '$lib/core/types.js';
	import { lineNumberLookup } from '$lib/core/line-numbers.js';
	import { diagnosticKey } from '$lib/diagnostics/order.js';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import {
		ignoredDiagnosticAccepted,
		ignoredDiagnosticRuleId,
		ignoredDiagnosticText
	} from '$lib/diagnostics/ignore.js';
	import { ruleName } from '$lib/rules/names.js';

	let {
		diagnosticKeys,
		matches,
		snapshot,
		onReveal,
		onRestore
	}: {
		diagnosticKeys: readonly string[];
		matches: ReadonlyMap<string, string>;
		snapshot?: EditorSnapshot;
		onReveal?: (diagnostic: Diagnostic) => void;
		onRestore: (diagnosticKey: string) => void;
	} = $props();

	let expanded = $state(false);
	let toggle: HTMLButtonElement | null = $state(null);

	const rows = $derived.by(() => {
		const diagnostics = new Map(snapshot?.diagnostics.map((item) => [diagnosticKey(item), item]));
		const lineAt = lineNumberLookup(snapshot?.text ?? '');
		return diagnosticKeys.map((key) => {
			const diagnostic = diagnostics.get(matches.get(key) ?? '');
			const section =
				diagnostic &&
				snapshot?.parsed.sections.find(
					(item) => item.from <= diagnostic.from && item.to >= diagnostic.to
				);
			const line = diagnostic ? lineAt(diagnostic.from) : undefined;
			return {
				key,
				diagnostic,
				name: ruleName(ignoredDiagnosticRuleId(key)),
				flagged: ignoredDiagnosticText(key),
				accepted: ignoredDiagnosticAccepted(key),
				location: line
					? `${section?.header?.raw ? `${section.header.raw} · ` : ''}Line ${line}`
					: undefined
			};
		});
	});
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
		<ChevronDown class="ignored-rules__chevron" size={16} aria-hidden="true" />
	</button>
	{#if expanded}
		<ul>
			{#each rows as row (row.key)}
				<li>
					<div class="ignored-rules__description">
						<strong class="ignored-rules__title"
							>{row.flagged ? `“${row.flagged}”` : row.name}</strong
						>
						{#if row.flagged}
							<span class="ignored-rules__rule">{row.name}</span>
						{/if}
						{#if mixed}
							<span class="ignored-rules__kind"
								>{row.accepted ? 'Marked as correct' : 'Ignored'}</span
							>
						{/if}
						{#if row.location && row.diagnostic && onReveal}
							<button
								type="button"
								class="button button--quiet button--flush"
								aria-label={`Show ${row.location}`}
								onclick={() => row.diagnostic && onReveal?.(row.diagnostic)}>{row.location}</button
							>
						{:else if snapshot}
							<span class="ignored-rules__location">No matching finding in the current lyrics</span>
						{/if}
					</div>
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
