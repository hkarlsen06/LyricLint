<script lang="ts">
	import type { Diagnostic, Severity, SourceReference } from '$lib/core/types.js';
	import { tick } from 'svelte';
	import DiagnosticDetails from './DiagnosticDetails.svelte';

	let {
		diagnostics,
		sources,
		activeDiagnosticKey,
		lineFor,
		onNavigate,
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		onIgnore
	}: {
		diagnostics: readonly Diagnostic[];
		sources: ReadonlyMap<string, SourceReference>;
		activeDiagnosticKey?: string;
		lineFor?: (offset: number) => number;
		onNavigate: (diagnostic: Diagnostic) => void;
		onPreviewFix: (diagnostic: Diagnostic, fix: NonNullable<Diagnostic['fixes']>[number]) => void;
		onCancelPreview: () => void;
		onApplyFix: (diagnostic: Diagnostic, fix: NonNullable<Diagnostic['fixes']>[number]) => void;
		onIgnore: (ruleId: string) => void;
	} = $props();

	const severityOrder: Record<Severity, number> = {
		error: 0,
		warning: 1,
		suggestion: 2,
		'manual-review': 3
	};

	const sortedDiagnostics = $derived(
		[...diagnostics].sort(
			(left, right) =>
				severityOrder[left.severity] - severityOrder[right.severity] ||
				left.from - right.from ||
				left.ruleId.localeCompare(right.ruleId)
		)
	);

	function cardKey(diagnostic: Diagnostic): string {
		return `${diagnostic.ruleId}:${diagnostic.from}:${diagnostic.to}`;
	}

	// Exactly one card sits expanded at a time; before any explicit choice the
	// top card starts expanded so the panel is never a wall of closed rows.
	let chosenKey = $state<string | undefined>();
	let list = $state<HTMLOListElement>();
	const expandedKey = $derived.by(() => {
		if (
			activeDiagnosticKey &&
			sortedDiagnostics.some((diagnostic) => cardKey(diagnostic) === activeDiagnosticKey)
		) {
			return activeDiagnosticKey;
		}
		if (chosenKey && sortedDiagnostics.some((diagnostic) => cardKey(diagnostic) === chosenKey)) {
			return chosenKey;
		}
		const first = sortedDiagnostics[0];
		return first ? cardKey(first) : undefined;
	});

	$effect(() => {
		const key = activeDiagnosticKey;
		const currentList = list;
		if (!key || !currentList) return;
		void tick().then(() => {
			const card = Array.from(currentList.children).find(
				(candidate) => (candidate as HTMLElement).dataset.diagnosticKey === key
			);
			card?.scrollIntoView({ block: 'nearest' });
		});
	});

	function severityLabel(severity: Severity): string {
		return severity === 'manual-review'
			? 'Manual review'
			: `${severity.slice(0, 1).toUpperCase()}${severity.slice(1)}`;
	}

	function subtitle(diagnostic: Diagnostic): string {
		const parts: string[] = [];
		if (lineFor) {
			parts.push(`Line ${lineFor(diagnostic.from)}`);
		}
		if (diagnostic.severity === 'manual-review') {
			parts.push('Judgment call — not an error');
		} else if (diagnostic.fixes?.some((fix) => fix.kind === 'safe')) {
			parts.push('Safe fix available');
		} else if (diagnostic.fixes?.some((fix) => fix.kind === 'preview')) {
			parts.push('Fix available with preview');
		}
		return parts.join(' · ');
	}

	function activate(diagnostic: Diagnostic): void {
		chosenKey = cardKey(diagnostic);
		onNavigate(diagnostic);
	}

	async function ignoreAndMoveFocus(ruleId: string, trigger: HTMLButtonElement): Promise<void> {
		const row = trigger.closest('li');
		const nextRowControl = row?.nextElementSibling?.querySelector<HTMLButtonElement>(
			'.diagnostic-list__navigate'
		);
		const fallback =
			trigger.closest('.right-panel')?.querySelector<HTMLButtonElement>('.ignored-rules__toggle') ??
			document.querySelector<HTMLButtonElement>('.ignored-rules__toggle');
		onIgnore(ruleId);
		await tick();
		if (nextRowControl?.isConnected) {
			nextRowControl.focus();
			return;
		}
		fallback?.focus();
	}
</script>

{#if sortedDiagnostics.length === 0}
	<p class="empty-state">No diagnostics match the current filters.</p>
{:else}
	<ol bind:this={list} class="diagnostic-list" aria-label="Document diagnostics">
		{#each sortedDiagnostics as diagnostic, index (`${cardKey(diagnostic)}-${index}`)}
			{@const expanded = cardKey(diagnostic) === expandedKey}
			<li
				data-diagnostic-key={cardKey(diagnostic)}
				class:diagnostic-error={diagnostic.severity === 'error'}
				class:diagnostic-card--expanded={expanded}
				class:diagnostic-card--active={cardKey(diagnostic) === activeDiagnosticKey}
			>
				<div class="diagnostic-list__heading">
					<span class={`severity severity--${diagnostic.severity}`}>
						<svg
							class="severity__icon"
							aria-hidden="true"
							viewBox="0 0 16 16"
							width="12"
							height="12"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							{#if diagnostic.severity === 'error'}
								<circle cx="8" cy="8" r="6" />
								<path d="M8 4.8v3.7M8 11.1v.1" />
							{:else if diagnostic.severity === 'warning'}
								<path d="M8 2.4 14.4 13H1.6Z" />
								<path d="M8 6.6v2.9M8 11.6v.1" />
							{:else if diagnostic.severity === 'suggestion'}
								<circle cx="8" cy="8" r="6" />
								<path d="M8 7.4v3.4M8 4.9v.1" />
							{:else}
								<circle cx="8" cy="8" r="6" />
								<path d="M5.4 8.2 7.2 10l3.4-3.6" />
							{/if}
						</svg>
						{severityLabel(diagnostic.severity)}
					</span>
					<button
						type="button"
						class="diagnostic-list__navigate"
						aria-label={`Go to ${diagnostic.message}`}
						aria-expanded={expanded}
						onclick={() => activate(diagnostic)}
					>
						{diagnostic.message}
					</button>
					{#if subtitle(diagnostic)}
						<span class="diagnostic-list__subtitle">{subtitle(diagnostic)}</span>
					{/if}
				</div>
				{#if expanded}
					<DiagnosticDetails
						{diagnostic}
						{sources}
						onPreviewFix={(fix) => onPreviewFix(diagnostic, fix)}
						{onCancelPreview}
						onApplyFix={(fix) => onApplyFix(diagnostic, fix)}
						onIgnore={(trigger) => ignoreAndMoveFocus(diagnostic.ruleId, trigger)}
					/>
				{/if}
			</li>
		{/each}
	</ol>
{/if}
