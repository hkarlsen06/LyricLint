<script lang="ts">
	import { tick } from 'svelte';
	import type { Diagnostic, EditorSnapshot } from '$lib/core/types.js';
	import { lineNumberLookup } from '$lib/core/line-numbers.js';
	import { diagnosticKey } from '$lib/diagnostics/order.js';
	import CaretDownIcon from 'phosphor-svelte/lib/CaretDownIcon';
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
	 * column is one nobody reads, for the same reason the diagnostic card gave up
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
		<CaretDownIcon class="ignored-rules__chevron" size={16} aria-hidden="true" weight="bold" />
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

<style>
	/* A quiet disclosure lives directly on the panel background. */
	.ignored-rules {
		padding: 0;
	}

	.ignored-rules__toggle {
		display: flex;
		width: 100%;
		min-height: var(--control-height-lg);
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-radius: var(--radius-control);
		gap: var(--space-2);
		align-items: center;
		justify-content: space-between;
		background: transparent;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
	}

	.ignored-rules__toggle:hover {
		background: var(--color-fill);
		color: var(--color-text);
	}

	.ignored-rules__toggle :global(.ignored-rules__chevron) {
		flex: none;
		transition: transform var(--duration-fast) var(--ease-out-quart);
	}

	.ignored-rules__toggle[aria-expanded='true'] :global(.ignored-rules__chevron) {
		transform: rotate(180deg);
	}

	/* The footer owns bottom spacing in both collapsed and expanded states. */
	.ignored-rules ul {
		display: grid;
		margin: 0;
		padding: 0;
		gap: var(--space-4);
		list-style: none;
	}

	/* The list is a continuation of the row above it, so it is set in that row's
	   type: a rule's name at body size beside a header at `--font-size-sm` read as
	   two lists that had landed on top of each other. */
	.ignored-rules li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--space-2);
		align-items: start;
		padding-inline: var(--space-2);
		font-size: var(--font-size-sm);
		overflow-wrap: anywhere;
	}

	.ignored-rules__description {
		display: flex;
		min-width: 0;
		flex-direction: column;
		align-items: start;
		gap: var(--space-1);
	}

	.ignored-rules__title {
		font-weight: var(--font-weight-medium);
	}

	.ignored-rules__rule,
	.ignored-rules__location {
		color: var(--color-text-muted);
	}

	.ignored-rules li > .button {
		white-space: nowrap;
	}

	/* Muted, because it qualifies the row rather than naming it: the rule and the
	   text it was keyed on are what the reader is scanning for. Drawn only where
	   the footer holds both kinds, so the word never runs down every row. */
	.ignored-rules__kind {
		color: var(--color-text-muted);
	}
</style>
