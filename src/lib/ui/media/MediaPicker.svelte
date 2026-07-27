<script lang="ts">
	import { tick } from 'svelte';
	import type { MediaStore } from '../state/media-store.svelte.js';

	let { media }: { media: MediaStore } = $props();

	let dialog: HTMLDialogElement;
	let trigger: HTMLButtonElement;
	let urlInput: HTMLInputElement;
	let url = $state('');
	let error = $state<string | undefined>(undefined);

	// The slot never moves and the label follows the state, the way the toolbar's
	// one contrast action swaps between `Copy lyrics` and `Paste lyrics`. A
	// control that disappeared once audio was attached would take the only way to
	// swap tracks with it.
	const label = $derived(media.player.attached || media.pendingName ? 'Change audio' : 'Add audio');

	// The link already in use, in the form worth having on a clipboard. A draft on
	// a video knows which one, so the field opens holding it — and holds it
	// selected, because the two things done to a link that is already there are
	// copying it out and typing over it, and a selection is the one state that
	// serves both without a clearing press first.
	async function open(): Promise<void> {
		url = media.videoId ? `https://youtu.be/${media.videoId}` : '';
		error = undefined;
		dialog.showModal();
		await tick();
		urlInput.select();
	}

	function close(): void {
		dialog.close();
		trigger.focus();
	}

	// Escape and the close control hand focus back; an outside press does not,
	// because the press has already named where the user is going.
	function dismissOnBackdrop(event: MouseEvent): void {
		if (event.target === dialog) dialog.close();
	}

	async function chooseFile(): Promise<void> {
		if (await media.attach()) close();
	}

	async function useVideo(): Promise<void> {
		error = await media.attachYouTube(url);
		if (error === undefined) close();
	}
</script>

<button
	bind:this={trigger}
	type="button"
	class="button--quiet status-bar__media"
	aria-haspopup="dialog"
	onclick={open}
>
	<svg
		aria-hidden="true"
		viewBox="0 0 16 16"
		width="13"
		height="13"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M6 12.25V3.5l7-1.25v8.5" />
		<circle cx="4.25" cy="12.25" r="1.75" />
		<circle cx="11.25" cy="10.75" r="1.75" />
	</svg>
	<span>{label}</span>
</button>

<!--
	One question — where is the song? — asked in one place, with the two answers
	side by side rather than as two commands the user has to tell apart in a list.
	It is a modal because it is a detour: nothing else in the workbench is worth
	doing until it is answered or abandoned.

	Neither answer is boxed. The dialog is already the surface, and giving each
	option a border would be two cards inside the card the user is looking at; a
	hairline between them is a separator, which is a different thing.

	YouTube is first because it is where most transcribers' audio already is.

	Each answer is a control and a line of facts under it, in the meta idiom the
	diagnostic card established — interpuncts, muted, small. It used to be a
	heading, a paragraph of prose, and then the control: two blocks of grey to
	read before either press, which read as a warning about the thing it was
	offering. A requirement stated as a specification reads as a specification;
	the same requirement spelled out in sentences reads as an apology for the
	button under it.
-->
<dialog
	bind:this={dialog}
	class="media-dialog"
	aria-labelledby="media-dialog-title"
	onclick={dismissOnBackdrop}
>
	<div class="media-dialog__surface">
		<div class="media-dialog__header">
			<h2 id="media-dialog-title">Add audio</h2>
			<button type="button" class="icon-button button--quiet" aria-label="Close" onclick={close}>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="16"
					height="16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				>
					<path d="m4 4 8 8M12 4l-8 8" />
				</svg>
			</button>
		</div>

		<div class="media-dialog__body">
			<section>
				<form
					class="media-dialog__url"
					onsubmit={(event) => {
						event.preventDefault();
						void useVideo();
					}}
				>
					<input
						bind:this={urlInput}
						bind:value={url}
						type="url"
						placeholder="youtube.com/watch?v=…"
						aria-label="YouTube link"
						autocomplete="off"
						spellcheck="false"
					/>
					<button type="submit" class="button" disabled={media.busy || url.trim() === ''}>
						Use video
					</button>
				</form>
				<!-- The trade, stated before the press that spends it, as facts rather
				     than as prose or a tinted warning box. -->
				<p class="media-dialog__meta">
					Google can theoretically see what you play · Needs internet · Asked once a session
				</p>
				<div aria-live="polite">
					{#if error}
						<p class="media-dialog__error">{error}</p>
					{/if}
				</div>
			</section>

			<section>
				<button
					type="button"
					class="button"
					onclick={() => void chooseFile()}
					disabled={media.busy}
				>
					Choose a file…
				</button>
				<p class="media-dialog__meta">Plays from your disk · Nothing is uploaded</p>
			</section>
		</div>
	</div>
</dialog>

<style>
	/* Quiet enough to belong in the quietest row in the window, and still a
	   control: it keeps the row's small type but takes the body color, so it
	   reads as pressable beside the muted counts rather than as one of them. */
	.status-bar__media {
		display: inline-flex;
		min-height: var(--control-height-sm);
		padding: 0 var(--space-1-5);
		gap: var(--space-1-5);
		align-items: center;
		color: var(--color-text);
		font-size: var(--font-size-xs);
	}

	.status-bar__media svg {
		flex: none;
		color: var(--color-text-muted);
	}

	.status-bar__media:hover svg {
		color: var(--color-text);
	}

	.media-dialog {
		width: min(30rem, calc(100vw - var(--space-4)));
		max-width: none;
		padding: 0;
		border: var(--border-width) solid var(--color-border-strong);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}

	.media-dialog::backdrop {
		background: var(--color-backdrop);
	}

	/* The title sits on the body rather than in a band of its own: a rule under a
	   header of this height is chrome around four lines of content. */
	.media-dialog__header {
		display: flex;
		padding: var(--space-3) var(--space-2) 0 var(--space-4);
		align-items: center;
		justify-content: space-between;
	}

	.media-dialog__header h2 {
		margin: 0;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-semibold);
	}

	.media-dialog__body {
		padding: var(--space-3) var(--space-4) var(--space-4);
	}

	/* The separator goes *between* the two answers, never above the first. */
	.media-dialog__body section + section {
		margin-top: var(--space-3);
		padding-top: var(--space-3);
		border-top: var(--border-width) solid var(--color-border);
	}

	.media-dialog__meta {
		margin: var(--space-2) 0 0 0;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		line-height: var(--line-height-body);
	}

	.media-dialog__url {
		display: flex;
		gap: var(--space-2);
	}

	.media-dialog__url input {
		flex: 1 1 auto;
		min-width: 0;
	}

	.media-dialog__error {
		margin: var(--space-1) 0 0 0;
		color: var(--color-danger);
		font-size: var(--font-size-xs);
		line-height: var(--line-height-body);
	}
</style>
