<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { sectionType } from '#lib/conversion/section-types.js';
	import {
		contentOffset,
		renderProfile,
		resolveDecision,
		type ConversionAction
	} from '#lib/conversion/index.js';
	import type { QuantityFacts, InstrumentalIntervalFacts } from '#lib/profiles/decisions.js';
	import {
		decideQuantityRepresentation,
		parseQuantityInteger,
		quantitySourceDigits,
		quantityWordingRequirement
	} from '#lib/profiles/decisions.js';
	import type { ConversionReviewRequest, WorkbenchController } from '../state/workbench.svelte.js';
	import { Select, type SelectOption } from '../primitives/select/index.js';

	const usageOptions: SelectOption<QuantityFacts['usage']>[] = [
		{ value: 'unknown', label: 'Not confirmed' },
		{ value: 'ordinary-cardinal', label: 'An ordinary quantity' },
		{ value: 'name-or-identifier', label: 'A name or identifier' },
		{ value: 'fixed-expression', label: 'A fixed expression' },
		{ value: 'date-or-time', label: 'A date or time' },
		{ value: 'phone-or-decade', label: 'A phone number or decade' }
	];
	const pronunciationOptions: SelectOption<QuantityFacts['pronunciation']>[] = [
		{ value: 'unknown', label: 'Not confirmed' },
		{ value: 'whole-quantity', label: 'Sung as the whole quantity' },
		{ value: 'individual-digits', label: 'Sung as individual digits' }
	];
	const targetOptions: SelectOption<'genius' | 'musixmatch'>[] = [
		{ value: 'genius', label: 'Genius' },
		{ value: 'musixmatch', label: 'Musixmatch' }
	];
	let {
		controller,
		savedOnly = false,
		onComplete,
		focused,
		previewPassage
	}: {
		controller: WorkbenchController;
		focused?: ConversionReviewRequest;
		previewPassage?: Snippet<[lyrics: string]>;
		savedOnly?: boolean;
		onComplete?: () => void;
	} = $props();
	const id = $props.id();
	let open = $state(false);
	let decisionKind = $state<'quantity' | 'instrumental'>('quantity');
	let quantityHeading = $state<HTMLHeadingElement>();
	let intervalHeading = $state<HTMLHeadingElement>();
	$effect(() => {
		const request = controller.requestedConversionReview;
		if (request?.kind !== 'quantity' && request?.kind !== 'instrumental') return;
		open = true;
		decisionKind = request.kind;
		void tick().then(() =>
			(request.kind === 'quantity' ? quantityHeading : intervalHeading)?.focus()
		);
	});
	const model = $derived(controller.snapshot.conversion?.model);
	const projection = $derived(model && renderProfile(model, controller.profile));
	const selection = $derived({
		from:
			focused?.range.from ??
			Math.min(controller.snapshot.selection.anchor, controller.snapshot.selection.head),
		to:
			focused?.range.to ??
			Math.max(controller.snapshot.selection.anchor, controller.snapshot.selection.head)
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
			language:
				model?.languageRanges.find((entry) => {
					const from = projection?.ok
						? contentOffset(projection.value, selection.from, -1)
						: selection.from;
					const to = projection?.ok
						? contentOffset(projection.value, selection.to, 1)
						: selection.to;
					return entry.from <= from && to <= entry.to;
				})?.language ?? controller.language,
			value,
			usage,
			pronunciation
		};
		if (spokenForm) facts.spokenForm = spokenForm;
		const sourceDigits = quantitySourceDigits(selectedText, value);
		if (digitForm || sourceDigits) facts.digitForm = digitForm || sourceDigits;
		return facts;
	});
	const wordingRequirement = $derived(quantityWordingRequirement(quantityFacts, selectedText));
	const eligibility = $derived(decideQuantityRepresentation(quantityFacts));
	const valueGuidance = $derived(
		parseQuantityInteger(value) === undefined ? eligibility : undefined
	);
	let beforeId = $state('');
	let start = $state<number>();
	let end = $state<number>();
	let lyricFree = $state(false);
	const typedSections = $derived(
		(model?.sections ?? []).map((section) => ({
			...section,
			type: sectionType(section, model?.defaultLanguage ?? 'und')
		}))
	);
	const pairs = $derived(
		typedSections.flatMap((section, index, sections) =>
			section.type && sections[index + 1]?.type && section.at < sections[index + 1].at
				? [{ before: section, after: sections[index + 1] }]
				: []
		)
	);
	const pair = $derived(pairs.find((entry) => entry.before.id === beforeId));
	const pairOptions = $derived(
		pairs.map((entry) => ({
			value: entry.before.id,
			label: `${entry.before.type} → ${entry.after.type}`
		}))
	);
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
	type Preview = { basis: string; action: ConversionAction; message: string } & (
		{ canApply: false } | { canApply: true; lyrics: string }
	);
	let quantityPreview = $state<Preview>();
	let intervalPreview = $state<Preview>();
	const quantityBasis = $derived(
		JSON.stringify([controller.snapshot.revision, controller.profile, selection, quantityFacts])
	);
	const candidate = $derived(
		preview({ kind: 'confirmQuantity', range: selection, facts: quantityFacts }, quantityBasis)
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
		value = parseQuantityInteger(selectedText) ?? '';
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
			lyrics: result.value.projection.text,
			message:
				action.kind === 'confirmQuantity'
					? `Proposed ${target === 'genius' ? 'Genius' : 'Musixmatch'} wording: ${result.value.document.forms.at(-1)?.text ?? ''}`
					: 'Musixmatch will show #INSTRUMENTAL followed by a blank line before the next section. Genius wording is retained.'
		};
	}
	function save(action: ConversionAction) {
		if (controller.applyConversionAction(action) && focused) {
			if (onComplete) onComplete();
			else controller.dismissConversionReview();
		}
	}
</script>

{#if model && !controller.snapshot.conversionRecovery && !controller.snapshot.originalRecovery}
	{#snippet content()}
		{#if !savedOnly}
			{#if !focused}<div class="tool-actions" aria-label="Listening decision">
					<button
						type="button"
						class="button button--quiet"
						aria-pressed={decisionKind === 'quantity'}
						onclick={() => (decisionKind = 'quantity')}>Quantity</button
					>
					<button
						type="button"
						class="button button--quiet"
						aria-pressed={decisionKind === 'instrumental'}
						onclick={() => (decisionKind = 'instrumental')}>Instrumental interval</button
					>
				</div>{/if}
			{#if decisionKind === 'quantity'}
				{#if selection.from < selection.to}
					<section>
						{#if !focused}<h3 tabindex="-1" bind:this={quantityHeading}>
								Quantity in the selected passage
							</h3>{/if}
						{#if !focused}<p class="conversion-facts__lyrics">{selectedText}</p>{/if}
						{#if !focused || parseQuantityInteger(selectedText) === undefined}
							<label
								>Exact whole-number value<input
									inputmode="numeric"
									bind:value
									aria-describedby={valueGuidance && !valueGuidance.ok
										? `${id}-value-guidance`
										: undefined}
								/></label
							>
						{/if}
						{#if valueGuidance && !valueGuidance.ok}<p id={`${id}-value-guidance`} role="status">
								{valueGuidance.message}
							</p>{/if}
						<Select
							label="How is this number used?"
							value={usage}
							options={usageOptions}
							onchange={(next) => (usage = next)}
						/>
						{#if usage === 'ordinary-cardinal'}
							<Select
								label="How is it sung?"
								value={pronunciation}
								options={pronunciationOptions}
								onchange={(next) => (pronunciation = next)}
							/>
							{#if pronunciation === 'whole-quantity' && wordingRequirement === 'required'}
								<label
									>Exact words as sung (required)<textarea bind:value={spokenForm} rows="4" required
									></textarea></label
								>
							{/if}
							{#if pronunciation === 'whole-quantity'}<details class="disclosure">
									<summary
										>{wordingRequirement === 'required'
											? 'Use custom digit form'
											: 'Use custom exact wording'}</summary
									>
									{#if wordingRequirement === 'optional'}
										<label
											>Exact words as sung<textarea bind:value={spokenForm} rows="4"
											></textarea></label
										>
									{/if}
									<label
										>Digit form, if applicable<input
											bind:value={digitForm}
											placeholder={quantitySourceDigits(selectedText, value)}
										/></label
									>
								</details>{/if}
							{#if !focused}
								<Select
									label="Format for this decision"
									value={target}
									options={targetOptions}
									onchange={(next) => (target = next)}
								/>
							{/if}
							<button
								type="button"
								class="button"
								disabled={!candidate.canApply}
								aria-expanded={!!currentQuantity}
								aria-controls={`${id}-quantity`}
								onclick={() =>
									(quantityPreview = preview(
										{ kind: 'confirmQuantity', range: selection, facts: quantityFacts },
										quantityBasis
									))}>Preview quantity</button
							>
							{#if !candidate.canApply && !valueGuidance && pronunciation !== 'unknown'}
								<p role="status">{candidate.message}</p>
							{/if}
						{:else if usage !== 'unknown'}
							<p role="status">
								This is not an ordinary quantity conversion. Use Edit in lyrics to follow the policy
								for this phrase.
							</p>
						{/if}
						<div id={`${id}-quantity`} aria-live="polite">
							{#if currentQuantity}
								{#if currentQuantity.canApply && previewPassage}{@render previewPassage(
										currentQuantity.lyrics
									)}{:else}<p>{currentQuantity.message}</p>{/if}
								{#if currentQuantity.canApply}<button
										type="button"
										class="button button--contrast"
										onclick={() => save(currentQuantity!.action)}>Apply quantity</button
									>{/if}{/if}
						</div>
					</section>
				{:else}<p>Select the complete quantity in the lyrics to review its representation.</p>{/if}
			{:else}
				<section>
					{#if !focused}<h3 tabindex="-1" bind:this={intervalHeading}>
							Instrumental interval
						</h3>{/if}
					{#if selectedMarker}<p>
							The selected #INSTRUMENTAL will become a confirmed Musixmatch marker. Genius will omit
							it.
						</p>{/if}
					{#if !recordingId}<p>Attach the recording before confirming an interval.</p>{/if}
					{#if !pairs.length}<p>
							Confirm the types of two adjacent sections before placing an interval between them.
						</p>{/if}
					<Select
						label="Between sections"
						placeholder="Choose adjacent sections"
						value={beforeId}
						options={pairOptions}
						onchange={(next) => (beforeId = next)}
					/>
					<div class="conversion-facts__interval-times">
						<label
							>Starts at (seconds)<input
								type="number"
								min="0"
								step="0.001"
								bind:value={start}
							/></label
						>
						<label
							>Ends at (seconds)<input type="number" min="0" step="0.001" bind:value={end} /></label
						>
					</div>
					<label class="conversion-facts__check"
						><input type="checkbox" bind:checked={lyricFree} />I listened to this recording: the
						entire interval has no qualifying lyrical content, including vocables or joik</label
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
									onclick={() => save(currentInterval!.action)}>Save instrumental interval</button
								>{/if}{/if}
					</div>
				</section>
			{/if}
		{/if}
		{#if !focused && model.decisions.length}
			<section aria-label="Saved decisions">
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
	{/snippet}
	<div class="conversion-facts">
		{#if focused}{@render content()}{:else}<details class="disclosure" bind:open>
				<summary>{savedOnly ? 'Saved decisions' : 'Decisions that need listening'}</summary
				>{@render content()}
			</details>{/if}
	</div>
{/if}

<style>
	.tool-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-block: var(--space-3);
	}
	[aria-pressed='true'] {
		background: var(--color-fill);
		text-decoration: underline;
	}

	.conversion-facts summary {
		cursor: pointer;
		font-weight: var(--font-weight-semibold);
	}
	@media (pointer: coarse) {
		.conversion-facts summary {
			box-sizing: border-box;
			min-height: var(--control-height-touch);
			padding-block: var(--space-3);
		}
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
	.conversion-facts textarea {
		font-size: var(--font-size-editor);
		width: 100%;
		max-width: 100%;
		min-width: 0;
		box-sizing: border-box;
	}
	/* The shared select lines up with the labelled fields around it. */
	.conversion-facts :global(.ui-select) {
		gap: var(--space-1);
	}
	.conversion-facts :global(.ui-select .ui-select__trigger) {
		font-size: var(--font-size-editor);
	}
	.conversion-facts textarea {
		padding: var(--control-padding-block) var(--control-padding-inline);
		resize: vertical;
	}
	.conversion-facts__lyrics {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.conversion-facts__interval-times {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: end;
		gap: var(--space-2);
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
