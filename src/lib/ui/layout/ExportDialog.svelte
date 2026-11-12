<script lang="ts">
	import { untrack } from 'svelte';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
	import DownloadSimpleIcon from 'phosphor-svelte/lib/DownloadSimpleIcon';
	import ExportIcon from 'phosphor-svelte/lib/ExportIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
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
	<ExportIcon aria-hidden="true" size={16} weight="bold" />
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
		<!-- One document pane between a title bar and an action band, the shape
		     Geist gives a modal: the output is the thing being edited, so it runs
		     edge to edge and fills the dialog instead of sitting in a box with a
		     resize grip. -->
		<div class="export-surface" {@attach dismissOnOutside(close)}>
			<div class="export-header">
				<div class="export-heading">
					<h2 id={titleId}>{profileLabels[target]} export</h2>
					<p>
						Edit this output for export. Make lyric changes in your main {profileLabels[
							controller.profile
						]} draft.
					</p>
				</div>
				<button
					type="button"
					class="icon-button button--quiet export-close"
					aria-label="Close"
					onclick={close}
				>
					<XIcon aria-hidden="true" size={16} weight="bold" />
				</button>
			</div>
			<textarea
				aria-label={`${profileLabels[target]} output`}
				bind:value={output}
				oninput={(event) => save(event.currentTarget.value)}
				spellcheck="false"></textarea>
			{#if error}<p class="export-error" role="alert">
					<WarningIcon aria-hidden="true" size={16} weight="bold" />{error}
				</p>{/if}
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
				<button type="button" class="button button--quiet export-edit" onclick={close}
					>Edit lyrics</button
				>
				<button
					type="button"
					class="button export-download"
					onclick={() => controller.downloadExport(output)}
				>
					<DownloadSimpleIcon aria-hidden="true" size={16} weight="bold" />
					Download .txt</button
				>
				<button
					type="button"
					class="button button--contrast export-copy"
					onclick={async () => {
						const request = ++copyRequest;
						const result = await controller.copyExport(output);
						if (request === copyRequest && session === controller.draftSession) copied = result;
					}}
				>
					{#if copied}<CheckIcon aria-hidden="true" size={16} weight="bold" />{:else}<CopyIcon
							aria-hidden="true"
							size={16}
							weight="bold"
						/>{/if}
					{copied ? 'Copied' : 'Copy'}</button
				>
			</div>
		</div>
	{/if}
</dialog>

<style>
	dialog {
		width: min(48rem, calc(100vw - var(--space-4)));
		max-width: none;
		height: min(46rem, calc(100dvh - var(--space-6)));
		max-height: calc(100dvh - var(--space-4));
		padding: 0;
		border: 0;
		border-radius: var(--radius-overlay);
		overflow: hidden;
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}
	dialog::backdrop {
		background: var(--color-backdrop);
	}
	.export-surface {
		display: grid;
		height: 100%;
		grid-template-rows: auto minmax(6rem, 1fr) auto auto;
		overflow: auto;
	}
	.export-header {
		display: flex;
		padding: var(--space-4) var(--space-4) var(--space-3) var(--space-5);
		gap: var(--space-3);
		align-items: flex-start;
		justify-content: space-between;
	}
	.export-heading {
		display: grid;
		gap: var(--space-1);
	}
	h2,
	p {
		margin: 0;
	}
	h2 {
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--tracking-heading);
		line-height: var(--line-height-tight);
	}
	.export-heading p {
		max-width: var(--measure-prose);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}
	.export-close {
		flex: none;
		margin-block-start: calc(-1 * var(--space-1));
	}
	/* The output is a document, so it takes the editor's paper, face and
	   measure, and the hairlines above and below it are the pane's edges. */
	textarea {
		width: 100%;
		height: 100%;
		min-height: 0;
		box-sizing: border-box;
		padding: var(--space-4) var(--space-5);
		border: 0;
		border-block: var(--border-width) solid var(--color-border);
		border-radius: 0;
		resize: none;
		background: var(--color-surface);
		box-shadow: none;
		color: var(--color-text-reading);
		font-family: var(--font-lyrics);
		font-size: var(--font-size-editor);
		font-size-adjust: var(--font-lyrics-size-adjust);
		line-height: var(--line-height-editor);
	}
	textarea:hover:not(:disabled) {
		background: var(--color-surface);
	}
	textarea:focus-visible {
		outline-offset: calc(-1 * var(--focus-ring-width));
	}
	.export-error {
		display: flex;
		padding: var(--space-2) var(--space-5);
		gap: var(--space-2);
		align-items: center;
		color: var(--color-danger);
		font-size: var(--font-size-sm);
		font-weight: var(--font-weight-medium);
	}
	.export-error :global(svg) {
		flex: none;
	}
	/* The action band: the way back to the lyrics at the leading end, the two
	   outputs together at the trailing end, the contrast action last. */
	.export-actions {
		display: flex;
		padding: var(--space-3) var(--space-4) var(--space-3) var(--space-5);
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
		background: var(--color-chrome);
	}
	.export-edit {
		margin-inline-end: auto;
		margin-inline-start: calc(-1 * var(--control-padding-inline));
	}
	.export-actions .button {
		white-space: nowrap;
	}
	.export-actions .button :global(svg) {
		flex: none;
	}
	.export-copy {
		min-width: calc(3 * var(--space-6));
	}
	@media (pointer: coarse) {
		.button,
		.icon-button {
			min-height: var(--control-height-touch);
		}
		.icon-button {
			min-width: var(--control-height-touch);
		}
	}
	@media (max-width: 30rem) {
		.export-header,
		.export-actions {
			padding-inline: var(--space-4) var(--space-3);
		}
		textarea {
			padding-inline: var(--space-4);
		}
		.export-actions .button :global(svg) {
			display: none;
		}
	}
</style>
