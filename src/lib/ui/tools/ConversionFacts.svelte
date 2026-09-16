<script lang="ts">
	import { tick } from 'svelte';
	import { renderProfile, resolveDecision, type ConversionAction } from '$lib/conversion/index.js';
	import type { QuantityFacts, InstrumentalIntervalFacts } from '$lib/profiles/decisions.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	let { controller }: { controller: WorkbenchController } = $props();
	const id = $props.id();
	let open = $state(false);
	let quantityHeading = $state<HTMLHeadingElement>();
	let intervalHeading = $state<HTMLHeadingElement>();
	$effect(() => {
		const request = controller.requestedConversionReview;
		if (request?.kind !== 'quantity' && request?.kind !== 'instrumental') return;
		open = true;
		void tick().then(() =>
			(request.kind === 'quantity' ? quantityHeading : intervalHeading)?.focus()
		);
	});
	const model = $derived(controller.snapshot.conversion?.model);
	const selection = $derived({
		from: Math.min(controller.snapshot.selection.anchor, controller.snapshot.selection.head),
		to: Math.max(controller.snapshot.selection.anchor, controller.snapshot.selection.head)
	});
	const selectedText = $derived(controller.snapshot.text.slice(selection.from, selection.to));
	const selectedMarker = $derived(selectedText === '#INSTRUMENTAL');
	const markerScope = $derived(selectedMarker ? `${selection.from}:${selection.to}` : '');
	const selectionScope = $derived(
		JSON.stringify([controller.profile, selection.from, selection.to, selectedText])
	);
	let value = $state('');
	let spokenForm = $state('');
	let digitForm = $state('');
	let usage = $state<QuantityFacts['usage']>('unknown');
	let pronunciation = $state<QuantityFacts['pronunciation']>('unknown');
	let target = $state<'genius' | 'musixmatch'>('musixmatch');
	const quantityFacts = $derived.by(() => {
		const facts: QuantityFacts = {
			profile: target,
			language: controller.language,
			value,
			usage,
			pronunciation
		};
		if (spokenForm) facts.spokenForm = spokenForm;
		if (digitForm) facts.digitForm = digitForm;
		return facts;
	});
	let beforeId = $state('');
	let start = $state<number>();
	let end = $state<number>();
	let lyricFree = $state(false);
	const pairs = $derived(
		model?.sections.flatMap((section, index, sections) =>
			section.type && sections[index + 1]?.type && section.at < sections[index + 1].at
				? [{ before: section, after: sections[index + 1] }]
				: []
		) ?? []
	);
	const pair = $derived(pairs.find((entry) => entry.before.id === beforeId));
	const recordingId = $derived(controller.media?.recordingId);
	const duration = $derived(controller.media?.player.duration);
	const intervalFacts = $derived<InstrumentalIntervalFacts>({
		language: controller.language,
		recordingId: recordingId ?? '',
		currentRecordingId: recordingId ?? '',
		startMs: start === undefined ? NaN : Math.round(start * 1000),
		endMs: end === undefined ? NaN : Math.round(end * 1000),
		recordingDurationMs: duration === undefined ? NaN : Math.round(duration * 1000),
		lyricalContent: lyricFree ? 'none-confirmed' : 'uncertain',
		placement: pair ? 'between-tagged-sections' : 'unknown',
		beforeSectionId: pair?.before.id ?? '',
		afterSectionId: pair?.after.id ?? ''
	});
	const intervalAction = $derived.by(() => {
		const action: Extract<ConversionAction, { kind: 'confirmInstrumentalInterval' }> = {
			kind: 'confirmInstrumentalInterval',
			facts: intervalFacts
		};
		if (selectedMarker) action.markerRange = selection;
		return action;
	});
	type Preview = { basis: string; action: ConversionAction; message: string; canApply: boolean };
	let quantityPreview = $state<Preview>();
	let intervalPreview = $state<Preview>();
	const quantityBasis = $derived(
		JSON.stringify([controller.snapshot.revision, controller.profile, selection, quantityFacts])
	);
	const intervalBasis = $derived(
		JSON.stringify([controller.snapshot.revision, controller.profile, intervalFacts, markerScope])
	);
	const currentQuantity = $derived(
		quantityPreview?.basis === quantityBasis ? quantityPreview : undefined
	);
	const currentInterval = $derived(
		intervalPreview?.basis === intervalBasis ? intervalPreview : undefined
	);
	const decisionNames = {
		'keep-form': 'Keep authored wording',
		'censored-token': 'Censored token',
		quantity: 'Quantity',
		'instrumental-interval': 'Instrumental interval'
	};

	// A listening confirmation is specific to the selected words or exact recording interval.
	$effect(() => {
		void selectionScope;
		value = '';
		spokenForm = '';
		digitForm = '';
		usage = 'unknown';
		pronunciation = 'unknown';
	});
	$effect(() => {
		void recordingId;
		void duration;
		void beforeId;
		void start;
		void end;
		void markerScope;
		lyricFree = false;
	});
	function preview(action: ConversionAction, basis: string): Preview {
		const projection = model && renderProfile(model, controller.profile);
		if (!projection?.ok)
			return {
				basis,
				action,
				canApply: false,
				message: 'The current lyrics are not ready for this decision.'
			};
		// This is the commit validator too: passage languages, exact selection and retained
		// metadata cannot disagree with a more permissive UI-only policy preview.
		const result = resolveDecision(model!, projection.value, action);
		if (!result.ok) return { basis, action, canApply: false, message: result.refusal.message };
		return {
			basis,
			action,
			canApply: true,
			message:
				action.kind === 'confirmQuantity'
					? `Proposed ${target === 'genius' ? 'Genius' : 'Musixmatch'} wording: ${result.value.document.forms.at(-1)?.text ?? ''}`
					: 'Musixmatch will show #INSTRUMENTAL followed by a blank line before the next section. Genius wording is retained.'
		};
	}
</script>

{#if model && !controller.snapshot.conversionRecovery && !controller.snapshot.originalRecovery}
	<details class="conversion-facts" bind:open>
		<summary>Decisions that need listening</summary>
		{#if selection.from < selection.to}
			<section>
				<h3 tabindex="-1" bind:this={quantityHeading}>Quantity in the selected passage</h3>
				<p class="conversion-facts__lyrics">{selectedText}</p>
				<label>Exact whole-number value<input inputmode="numeric" bind:value /></label>
				<label
					>Meaning<select bind:value={usage}
						><option value="unknown">Not confirmed</option><option value="ordinary-cardinal"
							>An ordinary quantity</option
						><option value="name-or-identifier">A name or identifier</option><option
							value="fixed-expression">A fixed expression</option
						><option value="date-or-time">A date or time</option><option value="phone-or-decade"
							>A phone number or decade</option
						></select
					></label
				>
				<label
					>Reading on the recording<select bind:value={pronunciation}
						><option value="unknown">Not confirmed</option><option value="whole-quantity"
							>Sung as the whole quantity</option
						><option value="individual-digits">Sung as individual digits</option></select
					></label
				>
				<label>Exact words as sung<input bind:value={spokenForm} /></label>
				<label>Digit form, if applicable<input bind:value={digitForm} /></label>
				<label
					>Format for this decision<select bind:value={target}
						><option value="genius">Genius</option><option value="musixmatch">Musixmatch</option
						></select
					></label
				>
				<button
					type="button"
					class="button"
					aria-expanded={!!currentQuantity}
					aria-controls={`${id}-quantity`}
					onclick={() =>
						(quantityPreview = preview(
							{ kind: 'confirmQuantity', range: selection, facts: quantityFacts },
							quantityBasis
						))}>Preview quantity</button
				>
				<div id={`${id}-quantity`} aria-live="polite">
					{#if currentQuantity}<p>{currentQuantity.message}</p>
						{#if currentQuantity.canApply}<button
								type="button"
								class="button button--contrast"
								onclick={() => controller.applyConversionAction(currentQuantity!.action)}
								>Save quantity decision</button
							>{/if}{/if}
				</div>
			</section>
		{:else}<p>Select the complete quantity in the lyrics to review its representation.</p>{/if}
		<section>
			<h3 tabindex="-1" bind:this={intervalHeading}>Instrumental interval</h3>
			{#if selectedMarker}<p>
					The selected #INSTRUMENTAL will become a confirmed Musixmatch marker. Genius will omit it.
				</p>{/if}
			{#if !recordingId}<p>Attach the recording before confirming an interval.</p>{/if}
			{#if !pairs.length}<p>
					Confirm the types of two adjacent sections before placing an interval between them.
				</p>{/if}
			<label
				>Between sections<select bind:value={beforeId}
					><option value="">Choose adjacent sections</option
					>{#each pairs as entry (entry.before.id)}<option value={entry.before.id}
							>{entry.before.type} → {entry.after.type}</option
						>{/each}</select
				></label
			>
			<label
				>Starts at (seconds)<input type="number" min="0" step="0.001" bind:value={start} /></label
			>
			<label>Ends at (seconds)<input type="number" min="0" step="0.001" bind:value={end} /></label>
			<label class="conversion-facts__check"
				><input type="checkbox" bind:checked={lyricFree} />I listened to this recording: the entire
				interval has no qualifying lyrical content, including vocables or joik</label
			>
			<button
				type="button"
				class="button"
				aria-expanded={!!currentInterval}
				aria-controls={`${id}-interval`}
				onclick={() => (intervalPreview = preview(intervalAction, intervalBasis))}
				>Preview instrumental interval</button
			>
			<div id={`${id}-interval`} aria-live="polite">
				{#if currentInterval}<p>{currentInterval.message}</p>
					{#if currentInterval.canApply}<button
							type="button"
							class="button button--contrast"
							onclick={() => controller.applyConversionAction(currentInterval!.action)}
							>Save instrumental interval</button
						>{/if}{/if}
			</div>
		</section>
		{#if model.decisions.length}
			<section>
				<h3>Saved decisions</h3>
				<ul>
					{#each model.decisions as decision (decision.id)}<li>
							{decisionNames[decision.kind]}<button
								type="button"
								class="button button--quiet"
								onclick={() =>
									controller.applyConversionAction({ kind: 'removeDetail', detailId: decision.id })}
								>Remove {decisionNames[decision.kind].toLowerCase()}</button
							>
						</li>{/each}
				</ul>
			</section>
		{/if}
	</details>
{/if}

<style>
	.conversion-facts summary {
		cursor: pointer;
		font-weight: var(--font-weight-semibold);
	}
	.conversion-facts section {
		display: grid;
		gap: var(--space-2);
		padding-block: var(--space-3);
	}
	.conversion-facts label {
		display: grid;
		gap: var(--space-1);
	}
	.conversion-facts input,
	.conversion-facts select {
		font-size: var(--font-size-editor);
		width: 100%;
		max-width: 100%;
		min-width: 0;
		box-sizing: border-box;
	}
	.conversion-facts__lyrics {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.conversion-facts__check {
		grid-template-columns: auto 1fr;
		align-items: start;
	}
	.conversion-facts__check input {
		width: auto;
	}
	.conversion-facts p {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
