<script lang="ts">
	import type { Diagnostic, DiagnosticFix, SourceReference } from '$lib/core/types.js';
	import SourceLink from '../primitives/SourceLink.svelte';

	let {
		diagnostic,
		sources,
		onApplyFix,
		onIgnore
	}: {
		diagnostic: Diagnostic;
		sources: ReadonlyMap<string, SourceReference>;
		onApplyFix: (fix: DiagnosticFix) => void;
		onIgnore: (trigger: HTMLButtonElement) => void;
	} = $props();

	let previewFix = $state<DiagnosticFix | undefined>();
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

	{#if diagnostic.fixes?.length}
		<div class="diagnostic-details__fixes" aria-label="Available fixes">
			{#each diagnostic.fixes as fix (`${fix.kind}-${fix.label}`)}
				{#if fix.kind === 'safe'}
					<button type="button" class="button button--primary" onclick={() => onApplyFix(fix)}>
						{fix.label}
					</button>
				{:else if previewFix === fix}
					<span class="confirm-row">
						Review the affected range before applying.
						<button
							type="button"
							class="button button--primary"
							onclick={() => {
								onApplyFix(fix);
								previewFix = undefined;
							}}>Apply previewed fix</button
						>
						<button
							type="button"
							class="button button--quiet"
							onclick={() => (previewFix = undefined)}>Cancel</button
						>
					</span>
				{:else}
					<button type="button" class="button button--quiet" onclick={() => (previewFix = fix)}>
						Preview: {fix.label}
					</button>
				{/if}
			{/each}
		</div>
	{/if}

	<div class="diagnostic-details__actions">
		<button
			type="button"
			class="button button--quiet"
			onclick={(event) => onIgnore(event.currentTarget)}
		>
			Ignore this session
		</button>
	</div>
</div>
