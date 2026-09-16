<script lang="ts">
	import { tick } from 'svelte';
	import { renderProfile, resolveDecision, type ConversionAction } from '$lib/conversion/index.js';
	import type { TextRange } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	let { controller }: { controller: WorkbenchController } = $props();
	const id = $props.id();
	let open = $state(false);
	let summary = $state<HTMLElement>();
	$effect(() => {
		if (controller.requestedConversionReview?.kind !== 'repeat') return;
		open = true;
		void tick().then(() => summary?.focus());
	});
	const basis = $derived(
		JSON.stringify([controller.draftId, controller.snapshot.revision, controller.profile])
	);
	const selection = $derived({
		from: Math.min(controller.snapshot.selection.anchor, controller.snapshot.selection.head),
		to: Math.max(controller.snapshot.selection.anchor, controller.snapshot.selection.head)
	});
	let passage = $state<{ basis: string; range: TextRange; text: string }>();
	const currentPassage = $derived(passage?.basis === basis ? passage : undefined);
	let count = $state<number | undefined>(2);
	let separator = $state<'\n' | ' '>('\n');
	const previewBasis = $derived(
		JSON.stringify([basis, currentPassage, selection, count, separator])
	);
	let preview = $state<{
		basis: string;
		message: string;
		text?: string;
		action?: ConversionAction;
	}>();
	const currentPreview = $derived(preview?.basis === previewBasis ? preview : undefined);
	function prepare() {
		const conversion = controller.snapshot.conversion;
		if (!conversion || !currentPassage) return;
		const projection = renderProfile(conversion.model, conversion.profile);
		if (!projection.ok) return;
		const action: ConversionAction = {
			kind: 'expandRepeat',
			passage: currentPassage.range,
			notation: selection,
			count: count ?? NaN,
			separator
		};
		const result = resolveDecision(conversion.model, projection.value, action);
		preview = result.ok
			? {
					basis: previewBasis,
					action,
					message:
						'Only the first occurrence keeps its existing annotations, voices and timing. Each added occurrence starts without them.',
					text: result.value.projection.text.slice(
						currentPassage.range.from,
						selection.to + result.value.projection.text.length - projection.value.text.length
					)
				}
			: { basis: previewBasis, message: result.refusal.message };
	}
</script>

{#if controller.snapshot.conversion && !controller.snapshot.conversionRecovery && !controller.snapshot.originalRecovery}
	<details class="repeat-expansion" bind:open>
		<summary bind:this={summary}>Expand a repeated passage</summary>
		<p>
			Select the lyrics that repeat, then choose Use selected passage. Next select their following
			repeat notation and confirm how many times those lyrics are performed.
		</p>
		<button
			type="button"
			class="button"
			disabled={selection.from === selection.to}
			onclick={() =>
				(passage = {
					basis,
					range: selection,
					text: controller.snapshot.text.slice(selection.from, selection.to)
				})}>Use selected passage</button
		>
		{#if currentPassage}
			<p class="repeat-expansion__lyrics" aria-label="Repeated passage">{currentPassage.text}</p>
			<label
				>Total occurrences, including the first<input
					type="number"
					min="2"
					max="100"
					step="1"
					bind:value={count}
				/></label
			>
			<label
				>Separate occurrences with<select bind:value={separator}
					><option value="&#10;">A line break</option><option value=" ">A space</option></select
				></label
			>
			<button
				type="button"
				class="button"
				aria-expanded={!!currentPreview}
				aria-controls={`${id}-preview`}
				onclick={prepare}>Preview repetitions</button
			>
			<div id={`${id}-preview`} aria-live="polite">
				{#if currentPreview}
					<p>{currentPreview.message}</p>
					{#if currentPreview.action}
						<pre aria-label="Expanded passage preview">{currentPreview.text}</pre>
						<button
							type="button"
							class="button button--contrast"
							onclick={() => controller.applyConversionAction(currentPreview!.action!)}
							>Expand this passage</button
						>
					{/if}
				{/if}
			</div>
		{:else if passage}<p>
				The lyrics or format changed. Select the passage again before expanding it.
			</p>{/if}
	</details>
{/if}

<style>
	.repeat-expansion {
		display: grid;
		gap: var(--space-2);
	}
	.repeat-expansion summary {
		cursor: pointer;
		font-weight: var(--font-weight-semibold);
	}
	.repeat-expansion label {
		display: grid;
		gap: var(--space-1);
		padding-block: var(--space-2);
	}
	.repeat-expansion input,
	.repeat-expansion select {
		font-size: var(--font-size-editor);
		min-width: 0;
		max-width: 100%;
		width: 100%;
	}
	.repeat-expansion pre,
	.repeat-expansion__lyrics {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
