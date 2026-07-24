<script lang="ts">
	import type { Diagnostic, DiagnosticFix, SourceReference } from '$lib/core/types.js';
	import SourceLink from '../primitives/SourceLink.svelte';

	let {
		diagnostic,
		sources,
		onChooseHeader,
		onAssignPerformers = () => {},
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		onIgnore
	}: {
		diagnostic: Diagnostic;
		sources: ReadonlyMap<string, SourceReference>;
		onChooseHeader: () => void;
		onAssignPerformers?: () => void;
		onPreviewFix: (fix: DiagnosticFix) => void;
		onCancelPreview: () => void;
		onApplyFix: (fix: DiagnosticFix) => void;
		onIgnore: (trigger: HTMLButtonElement) => void;
	} = $props();

	let previewFix = $state<DiagnosticFix | undefined>();
	let previousDiagnosticKey = $state('');
	$effect(() => {
		const key = `${diagnostic.ruleId}:${diagnostic.from}:${diagnostic.to}:${diagnostic.message}`;
		if (key !== previousDiagnosticKey) {
			previousDiagnosticKey = key;
			previewFix = undefined;
		}
	});

	// Svelte may proxy state values, so object identity is not a reliable way
	// to match the selected preview fix back to the item being rendered.
	function fixKey(fix: DiagnosticFix): string {
		return `${fix.kind}:${fix.label}`;
	}

	function isPreviewing(fix: DiagnosticFix): boolean {
		return previewFix !== undefined && fixKey(previewFix) === fixKey(fix);
	}
</script>

<div class="diagnostic-details">
	<p>{diagnostic.explanation}</p>

	<div class="diagnostic-details__sources" aria-label="Sources">
		{#each diagnostic.sourceIds as sourceId (sourceId)}
			{@const source = sources.get(sourceId)}
			{#if source}
				<SourceLink {source} />
			{:else}
				<p>Source metadata unavailable: {sourceId}</p>
			{/if}
		{/each}
	</div>

	<div class="diagnostic-details__actions">
		{#if diagnostic.ruleId === 'section.header-missing'}
			<button
				type="button"
				class="button button--pill diagnostic-details__fix"
				onclick={onChooseHeader}
			>
				Choose header
			</button>
		{/if}
		{#if diagnostic.ruleId === 'performer.inline-mismatch'}
			<button type="button" class="button diagnostic-details__fix" onclick={onAssignPerformers}>
				Assign section performers
			</button>
		{/if}
		{#each diagnostic.fixes ?? [] as fix (`${fix.kind}-${fix.label}`)}
			{#if fix.kind === 'safe'}
				<button
					type="button"
					class="button button--pill diagnostic-details__fix"
					onclick={() => onApplyFix(fix)}
				>
					{fix.label}
				</button>
			{:else if isPreviewing(fix)}
				<button
					type="button"
					class="button button--contrast diagnostic-details__cta"
					aria-label={`Confirm: ${fix.label}`}
					onclick={() => {
						onApplyFix(fix);
						previewFix = undefined;
					}}
				>
					Confirm
				</button>
				<button
					type="button"
					class="button button--quiet diagnostic-details__cancel"
					onclick={() => {
						previewFix = undefined;
						onCancelPreview();
					}}
				>
					Cancel
				</button>
			{:else}
				<button
					type="button"
					class="button button--contrast diagnostic-details__cta"
					aria-label={`Preview: ${fix.label}`}
					onclick={() => {
						previewFix = fix;
						onPreviewFix(fix);
					}}
				>
					Preview
				</button>
			{/if}
		{/each}
		{#if previewFix === undefined}
			<button
				type="button"
				class="diagnostic-details__ignore"
				onclick={(event) => onIgnore(event.currentTarget)}
			>
				Ignore this session
			</button>
		{/if}
	</div>

	<p class="sr-only" aria-live="polite">
		{previewFix ? 'Previewing this change in the editor. Confirm or cancel.' : ''}
	</p>
</div>
