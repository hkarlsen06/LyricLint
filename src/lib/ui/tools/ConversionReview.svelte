<script lang="ts">
	import { tick } from 'svelte';
	import {
		projectOffset,
		renderProfile,
		resolveDecision,
		type ConversionAction
	} from '#lib/conversion/index.js';
	import type { WorkbenchController, ConversionReviewRequest } from '../state/workbench.svelte.js';
	import ConversionFacts from './ConversionFacts.svelte';
	let {
		controller,
		request
	}: { controller: WorkbenchController; request: ConversionReviewRequest } = $props();
	let heading: HTMLHeadingElement;
	let container: HTMLElement;

	$effect(() => {
		void tick().then(() => {
			container?.scrollIntoView({ block: 'start' });
			heading?.focus({ preventScroll: true });
		});
	});
	const current = $derived(
		request.draftId === controller.draftId &&
			request.profile === controller.profile &&
			request.revision === controller.snapshot.revision
	);
	const ready = $derived(
		current && !controller.snapshot.conversionRecovery && !controller.snapshot.originalRecovery
	);
	const titles = {
		repeat: 'Replace repeat placeholder',
		quantity: 'Review quantity',
		instrumental: 'Review instrumental interval',
		censor: 'Review censored word'
	};
	const conversion = $derived(controller.snapshot.conversion);
	const projection = $derived(conversion && renderProfile(conversion.model, controller.profile));
	const target = $derived(controller.snapshot.text.slice(request.range.from, request.range.to));
	let sourceId = $state('');
	let copies = $state<number | undefined>();
	let heardPrefix = $state('');
	let listened = $state(false);
	const sources = $derived.by(() => {
		if (!projection?.ok || !conversion) return [];
		return conversion.model.sections.flatMap((section, index, sections) => {
			let from = projectOffset(projection.value, section.at, 1);
			let to = projectOffset(
				projection.value,
				sections[index + 1]?.at ?? conversion.model.content.length,
				-1
			);
			while (to > from && /\s/u.test(projection.value.text[to - 1])) to--;
			if (from >= to || to > request.range.from) return [];
			return [
				{
					id: section.id,
					from,
					to,
					label: `Section ${index + 1} · ${section.type ?? section.name ?? 'Lyrics'}`,
					text: projection.value.text.slice(from, to)
				}
			];
		});
	});
	const source = $derived(sources.find((entry) => entry.id === sourceId));
	const basis = $derived(JSON.stringify([request, sourceId, copies, heardPrefix, listened]));
	let preview = $state<{
		basis: string;
		message: string;
		text?: string;
		action?: ConversionAction;
	}>();
	const shown = $derived(preview?.basis === basis ? preview : undefined);
	async function back() {
		const panel = container.closest('.right-panel');
		controller.dismissConversionReview();
		await tick();
		const destinations = [
			panel?.querySelector<HTMLElement>('.diagnostic-card--expanded .diagnostic-list__navigate'),
			...Array.from(
				panel?.querySelectorAll<HTMLElement>(
					'.diagnostic-list li:not([hidden]) .diagnostic-list__navigate'
				) ?? []
			),
			document.getElementById('mobile-review-control'),
			panel?.querySelector<HTMLElement>('#linter-panel-tab')
		];
		destinations.find((control) => control && control.getClientRects().length > 0)?.focus();
	}
	function prepare() {
		if (!ready || !projection?.ok || !conversion) return;
		const action: ConversionAction | undefined =
			request.kind === 'repeat' && source
				? {
						kind: 'replaceRepeatPlaceholder',
						passage: { from: source.from, to: source.to },
						notation: request.range,
						copies: copies ?? NaN
					}
				: request.kind === 'censor' && listened
					? { kind: 'confirmCensoredToken', range: request.range, heardPrefix, audioCensored: true }
					: undefined;
		if (!action) return;
		const result = resolveDecision(conversion.model, projection.value, action);
		preview = result.ok
			? {
					basis,
					message:
						request.kind === 'repeat'
							? 'Only this placeholder changes. No source annotations, voices or timing are copied.'
							: 'No missing letters are inferred.',
					text: result.value.projection.text.slice(
						request.range.from,
						request.range.to + result.value.projection.text.length - projection.value.text.length
					),
					action
				}
			: { basis, message: result.refusal.message };
	}
</script>

<section class="conversion-review" bind:this={container} aria-label="Conversion task">
	<button class="button button--quiet" type="button" onclick={back}>Back to Review</button>
	<h2 tabindex="-1" bind:this={heading}>{titles[request.kind]}</h2>
	{#if !ready}
		<p role="status">
			The lyrics or format changed. Return to Review and open the current finding before applying a
			decision.
		</p>
	{:else if request.kind === 'quantity' || request.kind === 'instrumental'}
		<ConversionFacts {controller} focused={request} onComplete={() => void back()} />
	{:else}
		<p class="lyrics">{target}</p>
		{#if request.kind === 'repeat'}
			<label
				>Earlier source section<select bind:value={sourceId}
					><option value="">Choose the version to repeat</option
					>{#each sources as entry (entry.id)}<option value={entry.id}
							>{entry.label} · {entry.text.replaceAll('\n', ' / ')}</option
						>{/each}</select
				></label
			>
			{#if !sources.length}<p>
					No earlier section is available. Return to Review and edit the placeholder in the lyrics.
				</p>{/if}
			{#if source}<pre aria-label="Chosen source lyrics">{source.text}</pre>{/if}
			<label
				>Copies to insert here<input
					type="number"
					min="1"
					max="100"
					step="1"
					bind:value={copies}
				/></label
			>
			<p>
				The earlier source stays unchanged. Confirm how many complete copies belong at this
				placeholder, including for numbered notation.
			</p>
		{:else}
			<label>Audible prefix<input bind:value={heardPrefix} /></label>
			<label class="check"
				><input type="checkbox" bind:checked={listened} />I listened: the recording censors this
				word immediately after that prefix</label
			>
		{/if}
		<button
			class="button"
			type="button"
			disabled={request.kind === 'repeat' ? !source : !listened}
			onclick={prepare}>Preview replacement</button
		>
		<div aria-live="polite">
			{#if shown}<p>{shown.message}</p>
				{#if !shown.action}<button
						type="button"
						class="button button--quiet"
						onclick={() => {
							controller.dismissConversionReview();
							controller.showConversionPassage(request.range);
						}}>Edit passage in lyrics</button
					>{/if}
				{#if shown.action}<pre aria-label="Replacement preview">{shown.text}</pre>
					<button
						class="button button--contrast"
						type="button"
						onclick={() => {
							if (ready && shown?.action && controller.applyConversionAction(shown.action))
								void back();
						}}>Apply replacement</button
					>{/if}{/if}
		</div>
	{/if}
</section>

<style>
	.conversion-review {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		min-width: 0;
	}
	h2,
	p {
		margin: 0;
	}
	h2 {
		font-size: var(--font-size-lg);
	}
	label {
		display: grid;
		gap: var(--space-1);
	}
	input,
	select {
		font-size: var(--font-size-editor);
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
	}
	.check {
		grid-template-columns: auto 1fr;
	}
	.check input {
		width: auto;
	}
	pre,
	.lyrics {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-family: var(--font-lyrics);
	}
	button {
		white-space: normal;
	}
</style>
