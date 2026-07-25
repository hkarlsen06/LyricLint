<script lang="ts">
	import type { Diagnostic, DiagnosticFix, SourceReference } from '$lib/core/types.js';
	import SourceLink from '../primitives/SourceLink.svelte';

	const SOURCE_PREVIEW_LIMIT = 2;
	const SOURCE_COLLAPSE_THRESHOLD = 3;

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
	let sourcesExpanded = $state(false);
	let previousDiagnosticKey = $state('');
	const isUnrecognizedHeaderReview = $derived(diagnostic.ruleId === 'section.header-unrecognized');
	const visibleSourceIds = $derived(
		sourcesExpanded || diagnostic.sourceIds.length <= SOURCE_COLLAPSE_THRESHOLD
			? diagnostic.sourceIds
			: diagnostic.sourceIds.slice(0, SOURCE_PREVIEW_LIMIT)
	);
	const hiddenSourceCount = $derived(
		diagnostic.sourceIds.length > SOURCE_COLLAPSE_THRESHOLD
			? diagnostic.sourceIds.length - SOURCE_PREVIEW_LIMIT
			: 0
	);
	$effect(() => {
		const key = `${diagnostic.ruleId}:${diagnostic.from}:${diagnostic.to}:${diagnostic.message}`;
		if (key !== previousDiagnosticKey) {
			previousDiagnosticKey = key;
			previewFix = undefined;
			sourcesExpanded = false;
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
		{#each visibleSourceIds as sourceId (sourceId)}
			{@const source = sources.get(sourceId)}
			{#if source}
				<SourceLink {source} />
			{:else}
				<p>Source metadata unavailable: {sourceId}</p>
			{/if}
		{/each}
		{#if hiddenSourceCount > 0}
			<button
				type="button"
				class="button button--quiet diagnostic-details__sources-toggle"
				aria-expanded={sourcesExpanded}
				onclick={() => {
					sourcesExpanded = !sourcesExpanded;
				}}
			>
				{sourcesExpanded ? 'Show fewer sources' : `Show ${hiddenSourceCount} more sources`}
			</button>
		{/if}
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
					aria-label={`Apply: ${fix.label}`}
					onclick={() => onApplyFix(fix)}
				>
					Apply
				</button>
			{:else if isPreviewing(fix)}
				<button
					type="button"
					class="button button--contrast diagnostic-details__cta"
					aria-label={`Apply: ${fix.label}`}
					onclick={() => {
						onApplyFix(fix);
						previewFix = undefined;
					}}
				>
					Apply
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
			{#if isUnrecognizedHeaderReview}
				<button
					type="button"
					class="button button--contrast diagnostic-details__cta diagnostic-details__accept"
					onclick={(event) => onIgnore(event.currentTarget)}
				>
					It's correct
					<svg
						aria-hidden="true"
						viewBox="0 0 16 16"
						width="14"
						height="14"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M3.5 8.2 6.5 11l6-6" />
					</svg>
				</button>
			{:else}
				<button
					type="button"
					class="diagnostic-details__ignore"
					onclick={(event) => onIgnore(event.currentTarget)}
				>
					Ignore
				</button>
			{/if}
		{/if}
	</div>

	<p class="sr-only" aria-live="polite">
		{previewFix ? 'Previewing this change in the editor. Confirm or cancel.' : ''}
	</p>
</div>
