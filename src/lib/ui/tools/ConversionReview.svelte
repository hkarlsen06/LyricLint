<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import {
		projectOffset,
		renderProfile,
		resolveDecision,
		type ConversionAction
	} from '#lib/conversion/index.js';
	import type { WorkbenchController, ConversionReviewRequest } from '../state/workbench.svelte.js';
	import ConversionFacts from './ConversionFacts.svelte';
	import InlineDiffText from '../primitives/InlineDiffText.svelte';
	import { conversionContext } from './conversion-context.js';
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
	const recordingMismatch = $derived(request.recordingId !== controller.media?.recordingId);
	let recordingInvalidated = $state(false);
	$effect(() => {
		if (recordingMismatch) recordingInvalidated = true;
	});
	const recordingChanged = $derived(recordingMismatch || recordingInvalidated);
	const current = $derived(
		!recordingChanged &&
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
	const passage = $derived.by(() => {
		const text = controller.snapshot.text;
		const from = text.lastIndexOf('\n', Math.max(0, request.range.from - 1)) + 1;
		const nextLine = text.indexOf('\n', request.range.to);
		const before = text.slice(from, request.range.from);
		const after = text.slice(request.range.to, nextLine === -1 ? text.length : nextLine);
		return {
			before,
			after
		};
	});
	const context = $derived(
		request.kind === 'censor'
			? conversionContext(passage.before, passage.after)
			: { ...passage, clipped: false }
	);
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
					number: index + 1,
					from,
					to,
					label: `Section ${index + 1} · ${section.type ?? section.name ?? 'Lyrics'}`,
					text: projection.value.text.slice(from, to)
				}
			];
		});
	});
	const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	function opening(text: string, limit: number) {
		let result = '';
		let count = 0;
		for (const { segment } of segmenter.segment(text)) {
			if (count++ === limit) return result + '…';
			result += segment;
		}
		return text;
	}
	function excerpt(text: string) {
		const lines = text.split('\n', 5);
		return opening(lines.slice(0, 4).join('\n'), 96) + (lines.length > 4 ? '\n…' : '');
	}
	const source = $derived(sources.find((entry) => entry.id === sourceId));
	const basis = $derived(JSON.stringify([request, sourceId, copies, heardPrefix, listened]));
	type Preview = { basis: string; message: string } & (
		{ ok: false } | { ok: true; text: string; lyrics: string; action: ConversionAction }
	);
	let preview = $state<Preview>();
	const shown = $derived(preview?.basis === basis ? preview : undefined);
	let dialog: HTMLDialogElement;
	let surface = $state<'sources' | 'source' | 'result'>();
	let opener: HTMLButtonElement | undefined;
	const dialogId = $props.id();
	function openSurface(kind: NonNullable<typeof surface>, trigger: HTMLButtonElement) {
		if (!ready) return;
		// Native modal restoration must return directly to a noneditable control.
		trigger.focus({ preventScroll: true });
		opener = trigger;
		surface = kind;
		dialog.showModal();
	}
	function closeSurface() {
		if (dialog?.open) dialog.close();
		surface = undefined;
		if (opener?.isConnected && !opener.disabled) opener.focus({ preventScroll: true });
	}
	onDestroy(() => {
		if (dialog?.open) dialog.close();
	});
	$effect(() => {
		if (!ready && surface) closeSurface();
	});
	function choiceExcerpt(text: string) {
		const lines = text.split('\n');
		return (
			lines
				.slice(0, 2)
				.map((line) => {
					const clipped = opening(line, 160);
					if (clipped === line) return line;
					const boundary = clipped.lastIndexOf(' ');
					return boundary > 0 ? clipped.slice(0, boundary) + '…' : clipped;
				})
				.join('\n') + (lines.length > 2 ? '\n…' : '')
		);
	}

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
	function editPassage() {
		const range = request.range;
		controller.dismissConversionReview();
		controller.showConversionPassage(range, 'edit');
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
					ok: true,
					basis,
					message:
						request.kind === 'repeat'
							? 'Only this placeholder changes. No source annotations, voices or timing are copied.'
							: heardPrefix === ''
								? 'A fully censored word is shown as a single hyphen.'
								: 'No missing letters are inferred.',
					text: result.value.projection.text.slice(
						request.range.from,
						request.range.to + result.value.projection.text.length - projection.value.text.length
					),
					lyrics: result.value.projection.text,
					action
				}
			: { ok: false, basis, message: result.refusal.message };
	}
</script>

{#snippet replacementPassage(lyrics: string)}
	{@const replacement = lyrics.slice(
		request.range.from,
		request.range.to + lyrics.length - controller.snapshot.text.length
	)}
	<div class="conversion-review__preview">
		<h3>{request.kind === 'censor' ? 'Proposed change' : 'Proposed lyrics'}</h3>
		<p class="lyrics" aria-label="Replacement preview">
			{context.before}{#if request.kind === 'censor'}<InlineDiffText
					text={target}
					kind="del"
				/><InlineDiffText text={replacement} kind="ins" />{:else}<strong>{replacement}</strong
				>{/if}{context.after}
		</p>
	</div>
{/snippet}

<section class="conversion-review" bind:this={container} aria-label="Conversion task">
	<div class="conversion-review__navigation">
		<button class="button button--quiet" type="button" onclick={back}>Back to Review</button>
		{#if ready}<button class="button button--quiet" type="button" onclick={editPassage}
				>Edit in lyrics</button
			>{/if}
	</div>
	<h2 tabindex="-1" bind:this={heading}>{titles[request.kind]}</h2>
	{#if !ready}
		<p role="status">
			{recordingChanged
				? 'The recording changed. Return to Review and reopen the current finding, then listen to this recording and reconfirm before applying a decision.'
				: 'The lyrics or format changed. Return to Review and open the current finding before applying a decision.'}
		</p>
	{:else}
		<p class="lyrics" aria-label="Lyric passage">
			{context.before}<strong>{target}</strong>{context.after}
		</p>
		{#if context.clipped}
			<details>
				<summary>Full lyric line</summary>
				<p class="lyrics" aria-label="Full lyric passage">
					{passage.before}<strong>{target}</strong>{passage.after}
				</p>
			</details>
		{/if}
		{#if request.kind === 'quantity' || request.kind === 'instrumental'}
			<ConversionFacts
				{controller}
				focused={request}
				previewPassage={replacementPassage}
				onComplete={() => void back()}
			/>
		{:else}
			{#if request.kind === 'repeat'}
				<div class="conversion-review__source-field">
					<span id={`${dialogId}-source-label`}>Earlier source section</span>
					<button
						class="button"
						type="button"
						aria-labelledby={`${dialogId}-source-label ${dialogId}-source-trigger`}
						id={`${dialogId}-source-trigger`}
						aria-haspopup="dialog"
						onmousedown={(event) => event.preventDefault()}
						onclick={(event) => openSurface('sources', event.currentTarget)}
						>{source ? 'Change source version' : 'Choose the version to repeat'}</button
					>
				</div>
				{#if !sources.length}<p>
						No earlier section is available. Return to Review and edit the placeholder in the
						lyrics.
					</p>{/if}
				<label
					>Copies to insert here<input
						type="number"
						min="1"
						max="100"
						step="1"
						bind:value={copies}
					/></label
				>
				<p>Count every copy at this placeholder, including numbered notation.</p>
			{:else}
				<label
					>Audible prefix (if any)<input
						bind:value={heardPrefix}
						oninput={() => (listened = false)}
					/></label
				>
				<label class="check"
					><input type="checkbox" bind:checked={listened} /><span class="check__copy"
						><span class:check__inactive={heardPrefix !== ''} aria-hidden={heardPrefix !== ''}
							>I listened: this entire word is censored.</span
						><span class:check__inactive={heardPrefix === ''} aria-hidden={heardPrefix === ''}
							>I listened: this word is censored right after the prefix.</span
						></span
					></label
				>
			{/if}
			<div
				class="conversion-review__actions"
				class:conversion-review__actions--choice={request.kind === 'censor'}
			>
				<button
					class="button"
					type="button"
					disabled={request.kind === 'repeat' ? !source : !listened}
					onclick={prepare}>Preview replacement</button
				>
				{#if request.kind === 'censor'}<button
						class="button button--quiet"
						type="button"
						onclick={back}>Decide later</button
					>{/if}
			</div>
			{#if request.kind === 'repeat' && source}
				<p aria-label="Selected source section">{source.label}</p>
				{#if !shown?.ok}
					{#if excerpt(source.text) === source.text}
						<pre aria-label="Chosen source lyrics">{source.text}</pre>
					{:else}
						<p>Source excerpt</p>
						<pre aria-label="Source excerpt">{excerpt(source.text)}</pre>
					{/if}
				{/if}
			{/if}
			<div aria-live="polite">
				{#if shown}
					{#if shown.ok && request.kind === 'censor'}{@render replacementPassage(shown.lyrics)}{/if}
					<p>{shown.message}</p>
					{#if shown.ok}
						{#if request.kind === 'repeat'}
							<h3>Proposed lyrics</h3>
							<p>
								{shown.action.kind === 'replaceRepeatPlaceholder' ? shown.action.copies : ''}
								{shown.action.kind === 'replaceRepeatPlaceholder' && shown.action.copies === 1
									? 'copy'
									: 'copies'} ·
								{shown.text.split('\n').length}
								{shown.text.includes('\n') ? 'lines' : 'line'}
							</p>
							{#if excerpt(shown.text) === shown.text}
								<pre aria-label="Replacement preview">{shown.text}</pre>
							{:else}
								<p>Replacement excerpt</p>
								<pre aria-label="Replacement excerpt">{excerpt(shown.text)}</pre>
							{/if}
						{/if}
						<button
							class="button button--contrast"
							type="button"
							onclick={() => {
								if (ready && shown?.ok && controller.applyConversionAction(shown.action))
									void back();
							}}>Apply replacement</button
						>{/if}{/if}
			</div>
			{#if request.kind === 'repeat'}
				{#if source && (shown?.ok || excerpt(source.text) !== source.text)}
					<button
						class="button button--quiet"
						type="button"
						aria-haspopup="dialog"
						onmousedown={(event) => event.preventDefault()}
						onclick={(event) => openSurface('source', event.currentTarget)}
						>Full source lyrics</button
					>
				{/if}
				{#if shown?.ok && excerpt(shown.text) !== shown.text}
					<button
						class="button button--quiet"
						type="button"
						aria-haspopup="dialog"
						onmousedown={(event) => event.preventDefault()}
						onclick={(event) => openSurface('result', event.currentTarget)}
						>Full replacement lyrics</button
					>
				{/if}
			{/if}
		{/if}
	{/if}
</section>

<dialog
	bind:this={dialog}
	class="repeat-dialog"
	aria-labelledby={`${dialogId}-title`}
	onclick={(event) => {
		if (event.target === dialog) closeSurface();
	}}
	oncancel={(event) => {
		event.preventDefault();
		event.stopPropagation();
		closeSurface();
	}}
	onclose={(event) => {
		if (!event.currentTarget.open) surface = undefined;
	}}
>
	{#if surface}
		<div class="repeat-dialog__surface">
			<header>
				<div class="repeat-dialog__context">
					<h2 id={`${dialogId}-title`}>
						{surface === 'sources'
							? 'Earlier source section'
							: surface === 'source'
								? 'Full source lyrics'
								: 'Full replacement lyrics'}
					</h2>
					{#if surface !== 'sources'}<p>{source?.label}</p>{/if}
					{#if surface === 'result'}<p>
							{target} · {copies}
							{copies === 1 ? 'copy' : 'copies'}
						</p>{/if}
				</div>
				<button class="button button--quiet" type="button" onclick={closeSurface}>Close</button>
			</header>
			<div class="repeat-dialog__body">
				{#if surface === 'sources'}
					<ul>
						{#each sources as entry (entry.id)}
							<li>
								<button
									class="button button--quiet repeat-option"
									type="button"
									aria-pressed={sourceId === entry.id}
									onclick={() => {
										if (ready) {
											sourceId = entry.id;
											closeSurface();
										}
									}}
								>
									<span>{entry.label}{sourceId === entry.id ? ' · Selected' : ''}</span>
									{#if choiceExcerpt(entry.text) !== entry.text}<span>Source excerpt</span>{/if}
									<span class="lyrics">{choiceExcerpt(entry.text)}</span>
								</button>
								{#if choiceExcerpt(entry.text) !== entry.text}
									<details>
										<summary>Full source lyrics · Section {entry.number}</summary>
										<pre aria-label={entry.label}>{entry.text}</pre>
									</details>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					{#if surface === 'result' && shown?.ok}
						<pre aria-label="Replacement preview">{shown.text}</pre>
					{:else if surface === 'source' && source}
						<pre aria-label="Chosen source lyrics">{source.text}</pre>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</dialog>

<style>
	.conversion-review {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		min-width: 0;
	}
	h2,
	h3,
	p {
		margin: 0;
	}
	.conversion-review__navigation {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: var(--space-2);
	}
	h2 {
		font-size: var(--font-size-lg);
	}
	h3 {
		font-size: var(--font-size-md);
	}
	details .lyrics {
		margin-block-start: var(--space-2);
	}
	summary {
		cursor: pointer;
	}
	@media (pointer: coarse) {
		summary {
			min-height: var(--control-height-touch);
			align-content: center;
		}
	}
	.conversion-review__preview {
		--inline-diff-padding: var(--space-1);
		--inline-diff-gap: var(--space-2);
		display: grid;
		gap: var(--space-2);
		margin-block: var(--space-2);
	}
	.conversion-review__actions {
		display: grid;
		gap: var(--space-2);
	}
	.conversion-review__actions--choice {
		grid-template-columns: minmax(0, 1fr) auto;
	}
	label,
	.conversion-review__source-field {
		display: grid;
		gap: var(--space-1);
	}
	input {
		font-size: var(--font-size-editor);
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
	}
	.check {
		grid-template-columns: auto 1fr;
		align-items: center;
		min-height: var(--control-height-touch);
	}
	.check input {
		width: var(--space-5);
		height: var(--space-5);
		min-height: var(--space-5);
		margin: 0;
	}
	.check__copy {
		display: grid;
		min-width: 0;
	}
	.check__copy > span {
		grid-area: 1 / 1;
	}
	.check__inactive {
		visibility: hidden;
	}
	pre {
		margin: 0;
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
	.repeat-dialog {
		width: min(38rem, calc(100vw - var(--space-4)));
		max-width: none;
		max-height: none;
		height: min(42rem, calc(100dvh - var(--space-4)));
		padding: 0;
		border: 0;
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
		overflow: hidden;
	}
	.repeat-dialog::backdrop {
		background: var(--color-backdrop);
	}
	.repeat-dialog__surface {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		height: 100%;
	}
	.repeat-dialog header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4);
	}
	.repeat-dialog__context {
		min-width: 0;
		display: grid;
		gap: var(--space-2);
		overflow-wrap: anywhere;
	}
	.repeat-dialog__body {
		overflow-y: auto;
		padding: 0 var(--space-4) var(--space-4);
		display: grid;
		align-content: start;
		gap: var(--space-3);
	}
	.repeat-dialog ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-4);
	}
	.repeat-option {
		display: grid;
		gap: var(--space-2);
		width: 100%;
		text-align: start;
		overflow-wrap: anywhere;
	}
	.repeat-option[aria-pressed='true'] {
		background: var(--color-fill);
	}
	.repeat-dialog summary {
		padding: var(--space-2);
	}
</style>
