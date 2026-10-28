<script lang="ts">
	import ConversionFacts from './ConversionFacts.svelte';
	import RepeatExpansion from './RepeatExpansion.svelte';
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
	let sectionsOpen = $state(true);
	let activeSection = $state<string>();
	let removeId = $state<string>();
	let passageLanguage = $state('');
	let annotationId = $state('');
	let targetText = $state('');
	let heardPrefix = $state('');
	let audioCensored = $state(false);
	let spellingOpen = $state(false);
	let censorHeading = $state<HTMLHeadingElement>();
	$effect(() => {
		if (controller.requestedConversionReview?.kind !== 'censor') return;
		spellingOpen = true;
		void tick().then(() => censorHeading?.focus());
	});
	const targetProfile = $derived(controller.profile === 'genius' ? 'musixmatch' : 'genius');
	/**
	 * Listening decisions and repeat expansion are tasks, not metadata. They
	 * draw only once Review has asked for them, the diagnostic's Review action
	 * selects the finding, opens the matching decision here, and focuses its
	 * heading, so the Song tab stays a record of the song rather than a list
	 * of jobs. A draft with saved decisions still names them, because a saved
	 * choice is retained metadata with its own remove control.
	 */
	const showDecisions = $derived(
		controller.requestedConversionReview?.kind === 'quantity' ||
			controller.requestedConversionReview?.kind === 'instrumental' ||
			(model?.decisions.length ?? 0) > 0
	);
	const showRepeat = $derived(controller.requestedConversionReview?.kind === 'repeat');
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
		heardPrefix = '';
	});
	$effect(() => {
		void selectionScope;
		void heardPrefix;
		audioCensored = false;
	});
	function show(from: number, to = from) {
		if (!projection?.ok) return;
		controller.showConversionPassage({
			from: projectOffset(projection.value, from, 1),
			to: projectOffset(projection.value, to, -1)
		});
	}
	$effect(() => {
		const sectionId = controller.requestedSectionId;
		if (!sectionId) return;
		sectionsOpen = true;
		activeSection = sectionId;
		void tick().then(() =>
			container?.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(sectionId)}"]`)?.focus()
		);
	});
</script>

<div class="conversion-details" bind:this={container}>
	{#if controller.requestedConversionReview}
		<button
			type="button"
			class="button button--quiet"
			onclick={() => controller.setActiveTab('linter')}>Back to Review</button
		>
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
	{#if model && enabled}
		<details bind:open={sectionsOpen}>
			<summary>Sections ({model.sections.length})</summary>
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
				<section
					class="conversion-section"
					class:conversion-section--active={activeSection === section.id}
				>
					<h3 tabindex="-1" data-section-id={section.id}>
						<button
							type="button"
							class="button button--quiet conversion-section__summary"
							aria-expanded={activeSection === section.id}
							onclick={() => {
								activeSection = activeSection === section.id ? undefined : section.id;
								removeId = undefined;
							}}
						>
							<span aria-hidden="true">{activeSection === section.id ? '▾' : '▸'}</span>
							<span>
								Section {index + 1} · {section.type ?? (section.name || 'Type not set')}
							</span>
							{#if performers}<span class="conversion-section__performers">{performers}</span>{/if}
						</button>
					</h3>
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
				</section>
			{/each}
			<details>
				<summary>Add a section</summary>
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
		</details>
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
			<section>
				<h2>Selected passage</h2>
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
		{/if}
		{#if selection.from < selection.to}
			<details bind:open={spellingOpen}>
				<summary>Wording and retained annotations</summary>
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
						onclick={() => controller.applyConversionAction({ kind: 'keepForm', range: selection })}
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
				{#if selectedText === '****' || (controller.profile === 'musixmatch' && selectedText.endsWith('-'))}
					<h3 tabindex="-1" bind:this={censorHeading}>Censored recording</h3>
					<label>Audible prefix<input bind:value={heardPrefix} /></label>
					<label class="conversion-details__check"
						><input type="checkbox" bind:checked={audioCensored} />I listened: the recording censors
						this word immediately after that prefix</label
					>
					<p>
						The other format will show {targetProfile === 'musixmatch'
							? `${heardPrefix}-`
							: '****'}. No missing letters are inferred.
					</p>
					<button
						type="button"
						class="button"
						disabled={!audioCensored}
						onclick={() =>
							controller.applyConversionAction({
								kind: 'confirmCensoredToken',
								range: selection,
								heardPrefix,
								audioCensored: true
							})}>Save censored token</button
					>
				{/if}
			</details>
		{/if}
	{/if}
	{#if showDecisions}
		<ConversionFacts {controller} />
	{/if}
	{#if showRepeat}
		<RepeatExpansion {controller} />
	{/if}
</div>

<style>
	.conversion-section__summary {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		width: 100%;
		justify-content: flex-start;
		text-align: start;
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.conversion-section > h3 {
		margin: 0;
		font-weight: var(--font-weight-medium);
	}
	.conversion-section__performers {
		grid-column: 2;
		font-weight: var(--font-weight-regular);
		color: var(--color-text-muted);
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
		display: grid;
		gap: var(--space-2);
	}
	.conversion-details select,
	.conversion-details input,
	.conversion-details textarea {
		max-width: 100%;
		font-size: var(--font-size-editor);
	}
	.conversion-details__lyrics {
		white-space: pre-wrap;
	}
	.conversion-details__check {
		grid-template-columns: auto 1fr;
		align-items: start;
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
