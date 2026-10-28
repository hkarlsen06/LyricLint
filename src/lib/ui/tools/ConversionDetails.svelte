<script lang="ts">
	import ConversionFacts from './ConversionFacts.svelte';

	import { tick } from 'svelte';
	import { projectOffset, renderProfile } from '#lib/conversion/index.js';
	import type { ContentKind, SectionRecord } from '#lib/conversion/model.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	let { controller }: { controller: WorkbenchController } = $props();
	const conversion = $derived(controller.snapshot.conversion);
	const model = $derived(conversion?.model);
	const projection = $derived(
		conversion ? renderProfile(conversion.model, conversion.profile) : undefined
	);
	const types: NonNullable<SectionRecord['type']>[] = [
		'Intro',
		'Verse',
		'PreChorus',
		'Chorus',
		'Hook',
		'Bridge',
		'Outro'
	];

	let addingSection = $state(false);
	let addSectionSummary = $state<HTMLElement>();
	let activeSection = $state<string>();
	let removeId = $state<string>();
	let passageLanguage = $state('');
	let annotationId = $state('');
	let targetText = $state('');

	const targetProfile = $derived(controller.profile === 'genius' ? 'musixmatch' : 'genius');
	const showDecisions = $derived((model?.decisions.length ?? 0) > 0);
	let container: HTMLDivElement;
	const selection = $derived({
		from: Math.min(controller.snapshot.selection.anchor, controller.snapshot.selection.head),
		to: Math.max(controller.snapshot.selection.anchor, controller.snapshot.selection.head)
	});
	const selectedText = $derived(controller.snapshot.text.slice(selection.from, selection.to));
	const selectionScope = $derived(
		JSON.stringify([controller.profile, selection.from, selection.to, selectedText])
	);
	const enabled = $derived(
		!controller.snapshot.conversionRecovery && !controller.snapshot.originalRecovery
	);
	$effect(() => {
		void selectionScope;
		targetText = selectedText;
	});
	function show(from: number, to = from) {
		if (!projection?.ok) return;
		controller.showConversionPassage({
			from: projectOffset(projection.value, from, 1),
			to: projectOffset(projection.value, to, -1)
		});
	}
	async function backToReview() {
		const panel = container.closest('.right-panel');
		controller.setActiveTab('linter');
		await tick();
		const destination =
			panel?.querySelector<HTMLElement>('.retained-review button') ??
			panel?.querySelector<HTMLElement>('#linter-panel-tab');
		destination?.focus();
	}
	$effect(() => {
		const request = controller.requestedSection;
		if (!request) return;
		activeSection = request.id;
		if (request.id === 'new') addingSection = true;
		void tick().then(() => {
			if (request.id === 'new') addSectionSummary?.focus();
			else
				container
					?.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(request.id)}"]`)
					?.focus();
		});
	});
</script>

<div class="conversion-details" bind:this={container}>
	{#if controller.requestedSection?.origin === 'review'}
		<button type="button" class="button button--quiet" onclick={backToReview}>Back to Review</button
		>
	{/if}
	{#if model && enabled}
		<section class="section-editor">
			<h2>Sections</h2>
			<label
				>Choose a section<select
					value={activeSection ?? ''}
					onchange={(event) => {
						activeSection = event.currentTarget.value || undefined;
						removeId = undefined;
					}}
					><option value="">{model.sections.length} sections · Choose to edit</option
					>{#each model.sections as section, index (section.id)}<option value={section.id}
							>Section {index + 1} · {section.type ?? (section.name || 'Type not set')} · {model.content
								.slice(section.at, model.sections[index + 1]?.at ?? model.content.length)
								.trim()
								.split('\n')[0]}</option
						>{/each}</select
				></label
			>
			{#each model.sections as section, index (section.id)}
				{@const performers = [
					...new Set(
						model.voices
							.filter((voice) => voice.sectionId === section.id)
							.flatMap((voice) =>
								voice.performerIds.map(
									(id) =>
										controller.performers.find((performer) => performer.id === id)?.displayName ??
										voice.rawNameText ??
										'Unknown performer'
								)
							)
					)
				].join(', ')}
				{#if activeSection === section.id}<section
						class="conversion-section conversion-section--active"
					>
						<h3 tabindex="-1" data-section-id={section.id}>
							Section {index + 1} · {section.type ?? (section.name || 'Type not set')}
						</h3>
						{#if performers}<p class="conversion-section__performers">{performers}</p>{/if}
						{#if activeSection === section.id}
							<button type="button" class="button button--quiet" onclick={() => show(section.at)}
								>Show passage</button
							>
							<label
								>Section type
								<select
									value={section.type ?? ''}
									onchange={(event) =>
										controller.applyConversionAction({
											kind: 'setSectionType',
											sectionId: section.id,
											type: event.currentTarget.value as NonNullable<SectionRecord['type']>
										})}
								>
									<option value="" disabled>Type not set</option>
									{#each types as type (type)}<option value={type}
											>{type === 'PreChorus' ? 'Pre-Chorus' : type}</option
										>{/each}
								</select>
							</label>
							<details class="conversion-section__advanced">
								<summary>More section options</summary>
								{#if section.header}<p class="conversion-details__original">
										Genius label: {section.header.trim()}
									</p>{/if}
								{#each model.voices.filter((voice) => voice.sectionId === section.id) as voice (voice.id)}
									<p>
										{voice.performerIds
											.map(
												(id) =>
													controller.performers.find((performer) => performer.id === id)
														?.displayName ?? 'Unknown performer'
											)
											.join(' & ') ||
											voice.rawNameText ||
											'Unknown voice'}: {model.content.slice(voice.from, voice.to)}
									</p>
									<div class="tool-actions">
										<button
											type="button"
											class="button button--quiet"
											onclick={() => show(voice.from, voice.to)}>Show voice passage</button
										><button
											type="button"
											class="button button--quiet"
											onclick={() =>
												controller.applyConversionAction({
													kind: 'removeDetail',
													detailId: voice.id
												})}>Remove voice assignment</button
										>
									</div>
								{/each}
								<div class="tool-actions">
									<button
										type="button"
										class="button button--quiet"
										onclick={() =>
											controller.applyConversionAction({
												kind: 'moveSection',
												sectionId: section.id,
												at: controller.snapshot.selection.head
											})}>Move to cursor</button
									>
									{#if !model.voices.some((voice) => voice.sectionId === section.id)}<button
											type="button"
											class="button button--quiet"
											onclick={() =>
												controller.applyConversionAction({
													kind: 'removeSection',
													sectionId: section.id
												})}>Remove boundary</button
										>{/if}
									{#if model.sections[index - 1]}<button
											type="button"
											class="button button--quiet"
											onclick={() =>
												controller.applyConversionAction({
													kind: 'removeSection',
													sectionId: section.id,
													targetSectionId: model.sections[index - 1].id
												})}>Merge into previous section</button
										>{/if}
									{#if model.sections[index + 1]}<button
											type="button"
											class="button button--quiet"
											onclick={() =>
												controller.applyConversionAction({
													kind: 'removeSection',
													sectionId: section.id,
													targetSectionId: model.sections[index + 1].id
												})}>Merge into next section</button
										>{/if}
								</div>
								<div class="tool-actions">
									<button
										type="button"
										class:button--contrast={removeId === section.id}
										class="button"
										onclick={() => {
											if (removeId !== section.id) {
												removeId = section.id;
												controller.feedback.announce(
													'Confirm deletion of this section and its lyrics.'
												);
												return;
											}
											if (
												controller.applyConversionAction({
													kind: 'removeSection',
													sectionId: section.id,
													deleteLyrics: true
												})
											)
												removeId = undefined;
										}}
										>{removeId === section.id
											? 'Confirm deletion'
											: 'Delete section and lyrics'}</button
									>
									{#if removeId === section.id}<button
											type="button"
											class="button button--quiet"
											onclick={() => (removeId = undefined)}>Cancel</button
										>{/if}
								</div>
							</details>
						{/if}
					</section>{/if}
			{/each}
			<details bind:open={addingSection}>
				<summary bind:this={addSectionSummary}>Add a section</summary>
				<button
					type="button"
					class="button"
					onclick={() =>
						controller.applyConversionAction({
							kind: 'insertSection',
							at:
								controller.snapshot.text.lastIndexOf(
									'\n',
									Math.max(0, controller.snapshot.selection.head - 1)
								) + 1
						})}>Insert boundary at cursor</button
				>
				<p>Section tags stay in this draft. Apply them separately when submitting to Musixmatch.</p>
			</details>
		</section>
		{#if model.wrappers.length || model.languageRanges.length || model.forms.length}
			<details>
				<summary>Retained details</summary>
				{#each model.wrappers as detail (detail.id)}
					<section class="conversion-section">
						<h3>
							{detail.kind === 'annotation'
								? `Genius annotation ${detail.annotationId}`
								: `Genius voice style ${detail.styleSlot}`}
						</h3>
						<p>{model.content.slice(detail.from, detail.to)}</p>
						<div class="tool-actions">
							<button
								type="button"
								class="button button--quiet"
								onclick={() => show(detail.from, detail.to)}>Show passage</button
							><button
								type="button"
								class="button button--quiet"
								onclick={() =>
									controller.applyConversionAction({ kind: 'removeDetail', detailId: detail.id })}
								>Remove detail</button
							>
						</div>
					</section>
				{/each}
				{#each model.forms as form (form.id)}
					<section class="conversion-section">
						<h3>{form.profile === 'genius' ? 'Genius' : 'Musixmatch'} wording</h3>
						<p>{form.text || 'Omitted in this format'}</p>
						<button
							type="button"
							class="button button--quiet"
							onclick={() => show(form.from, form.to)}>Show passage</button
						><button
							type="button"
							class="button button--quiet"
							onclick={() =>
								controller.applyConversionAction({ kind: 'removeDetail', detailId: form.id })}
							>Remove wording choice</button
						>
					</section>
				{/each}
				{#each model.languageRanges as range (range.id)}
					<section class="conversion-section">
						<h3>Passage language: {range.language}</h3>
						<p>{model.content.slice(range.from, range.to)}</p>
						<div class="tool-actions">
							<button
								type="button"
								class="button button--quiet"
								onclick={() => show(range.from, range.to)}>Show passage</button
							><button
								type="button"
								class="button button--quiet"
								onclick={() =>
									controller.applyConversionAction({ kind: 'removeDetail', detailId: range.id })}
								>Use document language</button
							>
						</div>
					</section>
				{/each}
			</details>
		{/if}
		{#if selection.from < selection.to}
			<details class="passage-tools">
				<summary>Selected passage tools</summary>
				<section>
					<label
						>Passage language<input
							bind:value={passageLanguage}
							placeholder="Language code, for example fr"
						/></label
					><button
						type="button"
						class="button"
						disabled={!passageLanguage.trim()}
						onclick={() =>
							controller.applyConversionAction({
								kind: 'setPassageLanguage',
								range: selection,
								language: passageLanguage
							})}>Set passage language</button
					>
				</section>
				<section>
					<h3>Wording and retained annotations</h3>
					{#if controller.profile === 'musixmatch'}<button
							type="button"
							class="button"
							onclick={() => controller.prepareInterpretation('genius')}
							>Interpret as Genius formatting</button
						>{/if}
					<p class="conversion-details__lyrics">{selectedText}</p>
					<label
						>{targetProfile === 'genius' ? 'Genius' : 'Musixmatch'} wording<textarea
							bind:value={targetText}
							rows="2"></textarea></label
					>
					<p>
						This keeps a wording choice for the selected passage. It does not confirm its meaning or
						compliance with the guidelines.
					</p>
					<div class="tool-actions">
						<button
							type="button"
							class="button"
							onclick={() =>
								controller.applyConversionAction({
									kind: 'setForm',
									profile: targetProfile,
									range: selection,
									text: targetText
								})}>Save this wording</button
						><button
							type="button"
							class="button button--quiet"
							onclick={() =>
								controller.applyConversionAction({ kind: 'keepForm', range: selection })}
							>Keep current wording</button
						>
					</div>
					<label>Genius annotation ID<input inputmode="numeric" bind:value={annotationId} /></label>
					<button
						type="button"
						class="button"
						disabled={!/^\d+$/u.test(annotationId)}
						onclick={() =>
							controller.applyConversionAction({
								kind: 'attachAnnotation',
								range: selection,
								annotationId
							})}>Attach annotation to selection</button
					>
				</section>
			</details>
		{/if}
	{/if}
	<details>
		<summary>Document settings</summary>
		<label
			>Content type
			<select
				disabled={!enabled}
				value={model?.contentKind ?? 'unknown'}
				onchange={(event) =>
					controller.applyConversionAction({
						kind: 'setContentKind',
						contentKind: event.currentTarget.value as ContentKind
					})}
			>
				<option value="unknown">Not specified</option><option value="original"
					>Original lyrics</option
				><option value="translation">Translation</option><option value="romanization"
					>Romanization</option
				>
			</select>
		</label>
	</details>
	{#if showDecisions}
		<ConversionFacts {controller} savedOnly />
	{/if}
</div>

<style>
	.conversion-details {
		min-width: 0;
		grid-template-columns: minmax(0, 1fr);
		align-content: start;
	}

	.conversion-details > section,
	.conversion-details > details {
		margin: 0;
	}
	.conversion-details :is(section, details[open]) > :is(label, .tool-actions, button, p, details) {
		margin-block-start: var(--space-3);
	}
	.conversion-details summary {
		min-height: var(--control-height-touch);
		align-content: center;
	}
	.conversion-details h2 {
		font-size: var(--font-size-lg);
		margin: 0 0 var(--space-3);
	}
	.conversion-details h3 {
		margin-block: var(--space-4) var(--space-2);
	}
	.conversion-section__performers {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.section-editor > label {
		margin-bottom: var(--space-3);
	}

	.conversion-section--active {
		padding-block-end: var(--space-4);
	}
	.conversion-section__advanced {
		margin-block-start: var(--space-3);
	}
	.conversion-details :is(input, select, textarea) {
		max-width: 100%;
		box-sizing: border-box;
		font-size: var(--font-size-editor);
	}
	.conversion-details button {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.conversion-details {
		display: grid;
		gap: var(--space-5);
	}
	.conversion-details label {
		min-width: 0;
		display: grid;
		gap: var(--space-2);
	}
	.conversion-details select,
	.conversion-details input,
	.conversion-details textarea {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		font-size: var(--font-size-editor);
	}
	.conversion-details__lyrics {
		white-space: pre-wrap;
	}
	.conversion-details summary {
		cursor: pointer;
		font-weight: var(--font-weight-semibold);
	}
	.conversion-section {
		margin: 0;
		padding-block: var(--space-1);
		overflow-wrap: anywhere;
	}
	.conversion-section h3 {
		font-size: var(--font-size-md);
	}
	.conversion-section .button {
		min-width: 0;
	}
	.conversion-details__original {
		color: var(--color-text-muted);
	}
</style>
