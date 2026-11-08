<script lang="ts">
	import { untrack } from 'svelte';
	import { dismissOnOutside } from '#lib/interaction/dismiss.js';
	import { profileLabels } from '#lib/profiles/types.js';
	import { otherProfile } from '#lib/persistence/writing.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';

	let { controller }: { controller: WorkbenchController } = $props();
	const titleId = $props.id();
	let dialog: HTMLDialogElement;
	let opener: HTMLButtonElement;
	let discard = $state.raw<HTMLButtonElement>();
	let open = $state(false);
	let output = $state('');
	let session = 0;
	let error = $state('');
	let copied = $state(false);
	let copyRequest = 0;
	const target = $derived(otherProfile(controller.profile));

	let lastRequest = 0;
	$effect(() => {
		const request = controller.exportSession;
		if (request > lastRequest) {
			lastRequest = request;
			untrack(show);
		}
	});
	function show() {
		copyRequest += 1;
		const generated = controller.getExport();
		if (generated === undefined) return;
		session = controller.draftSession;
		output = generated;
		error = '';
		copied = false;
		// Native dialog focus restoration must never target the lyric editor.
		opener.focus();
		open = true;
		dialog.showModal();
	}
	function close() {
		copyRequest += 1;
		if (error) {
			discard?.focus();
			return;
		}
		open = false;
		dialog.close();
	}
	function save(text: string) {
		copyRequest += 1;
		output = text;
		copied = false;
		error = controller.setExport(output, session)
			? ''
			: 'This output could not be saved. Shorten it to save, or copy or download it here.';
	}
</script>

<svelte:window
	onbeforeunload={(event) => {
		if (!error) return;
		event.preventDefault();
		event.returnValue = '';
	}}
/>

<button
	bind:this={opener}
	type="button"
	class="button button--quiet"
	aria-haspopup="dialog"
	onclick={show}
>
	Export to {profileLabels[target]}
</button>
<dialog
	bind:this={dialog}
	aria-labelledby={titleId}
	oncancel={(event) => {
		event.preventDefault();
		close();
	}}
	onclose={() => {
		open = false;
	}}
>
	{#if open}
		<div class="export-surface" {@attach dismissOnOutside(close)}>
			<div class="export-header">
				<h2 id={titleId}>{profileLabels[target]} export</h2>
				<button type="button" class="button button--quiet" onclick={close}>Close</button>
			</div>
			<p>
				Edit this output for export. Make lyric changes in your main {profileLabels[
					controller.profile
				]} draft.
			</p>
			<textarea
				aria-label={`${profileLabels[target]} output`}
				bind:value={output}
				oninput={(event) => save(event.currentTarget.value)}
				spellcheck="false"></textarea>
			{#if error}<p role="alert">{error}</p>{/if}
			<div class="export-actions">
				{#if error}
					<button
						bind:this={discard}
						type="button"
						class="button button--quiet"
						onclick={() => {
							error = '';
							close();
						}}>Discard unsaved output and close</button
					>
				{/if}
				<button type="button" class="button button--quiet" onclick={close}>Edit lyrics</button>
				<button type="button" class="button" onclick={() => controller.downloadExport(output)}
					>Download .txt</button
				>
				<button
					type="button"
					class="button button--contrast"
					onclick={async () => {
						const request = ++copyRequest;
						const result = await controller.copyExport(output);
						if (request === copyRequest && session === controller.draftSession) copied = result;
					}}>{copied ? 'Copied' : 'Copy'}</button
				>
			</div>
		</div>
	{/if}
</dialog>

<style>
	.export-actions .button--contrast {
		min-width: calc(3 * var(--space-6));
	}
	dialog {
		width: min(48rem, calc(100vw - var(--space-4)));
		max-width: none;
		max-height: calc(100dvh - var(--space-4));
		padding: 0;
		border: 0;
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}
	dialog::backdrop {
		background: var(--color-backdrop);
	}
	.export-surface {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		max-height: calc(100dvh - var(--space-4));
		box-sizing: border-box;
		overflow: auto;
	}
	.export-header,
	.export-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	h2,
	p {
		margin: 0;
	}
	h2 {
		font-size: var(--font-size-lg);
	}
	textarea {
		width: 100%;
		min-height: 6rem;
		height: min(50dvh, 28rem);
		flex: 1 1 auto;
		box-sizing: border-box;
		resize: vertical;
		font-family: var(--font-lyrics);
		font-size: var(--font-size-editor);
		line-height: var(--line-height-body);
		color: var(--color-text);
		background: var(--color-canvas);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-control);
		padding: var(--space-3);
	}
	@media (pointer: coarse) {
		.button {
			min-height: var(--control-height-touch);
		}
	}
</style>
