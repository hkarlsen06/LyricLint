<script lang="ts">
	import type { Diagnostic, DiagnosticFix, SourceReference } from '$lib/core/types.js';
	import SourceLink from '../primitives/SourceLink.svelte';

	let {
		diagnostic,
		sources,
		onPreviewFix,
		onCancelPreview,
		onApplyFix,
		onIgnore
	}: {
		diagnostic: Diagnostic;
		sources: ReadonlyMap<string, SourceReference>;
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
				<div class="diagnostic-preview" aria-live="polite">
					<p>Previewing this change in the editor.</p>
					<div class="diagnostic-preview__actions">
						<button
							type="button"
							class="button button--pill diagnostic-details__fix"
							onclick={() => {
								onApplyFix(fix);
								previewFix = undefined;
							}}>Apply previewed fix</button
						>
						<button
							type="button"
							class="button button--quiet"
							onclick={() => {
								previewFix = undefined;
								onCancelPreview();
							}}>Cancel</button
						>
					</div>
				</div>
			{:else}
				<button
					type="button"
					class="button button--pill diagnostic-details__fix"
					onclick={() => {
						previewFix = fix;
						onPreviewFix(fix);
					}}
				>
					Preview: {fix.label}
				</button>
			{/if}
		{/each}
		<button
			type="button"
			class="diagnostic-details__ignore"
			onclick={(event) => onIgnore(event.currentTarget)}
		>
			Ignore this session
		</button>
	</div>
</div>
