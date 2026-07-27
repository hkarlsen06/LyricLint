<script lang="ts">
	import { resolve } from '$app/paths';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { onMount } from 'svelte';
	import AppWordmark from './AppWordmark.svelte';
	import DraftMenu from './DraftMenu.svelte';
	import LanguagePicker from './LanguagePicker.svelte';
	import SongFacts, { hasSongFacts } from '../media/SongFacts.svelte';
	import { DEFAULT_DRAFT_TITLE } from '$lib/persistence/draft-repository.js';

	let {
		controller,
		brandRevealed = true
	}: { controller: WorkbenchController; brandRevealed?: boolean } = $props();
	// Presentation-only clock for the "Saved locally · Ns ago" readout. It never
	// feeds back into the controller; it only re-renders the relative timestamp.
	let lastSavedAt = $state<number | undefined>();
	let clock = $state(Date.now());
	let previousStatus: string | undefined;

	$effect(() => {
		const status = controller.saveStatus;
		if (status === 'saved' && previousStatus !== 'saved') {
			lastSavedAt = Date.now();
		}
		previousStatus = status;
	});

	onMount(() => {
		const timer = setInterval(() => {
			clock = Date.now();
		}, 1000);
		return () => clearInterval(timer);
	});

	function relativeSaveTime(savedAt: number, now: number): string {
		const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
		if (seconds < 5) return 'just now';
		if (seconds < 60) return `${seconds}s ago`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m ago`;
		return `${Math.floor(minutes / 60)}h ago`;
	}

	const saveStatusText = $derived.by(() => {
		switch (controller.saveStatus) {
			case 'saved':
				return lastSavedAt === undefined
					? 'Saved locally'
					: `Saved locally · ${relativeSaveTime(lastSavedAt, clock)}`;
			case 'failed':
				return 'Save failed';
			case 'saving':
				return 'Saving…';
			case 'scheduled':
				return 'Save pending';
			default:
				return 'Local draft';
		}
	});

	// Fallback sizing for browsers without `field-sizing: content`; the CSS rule
	// takes over where it is supported and this attribute is ignored. Typing
	// writes the length locally; switching drafts resyncs it.
	let titleLength = $derived(controller.title.length);
	const titleSize = $derived(Math.min(28, Math.max(8, titleLength + 1)));

	// The title input lives outside a form, so Enter has no implicit submit to
	// piggyback on: commit explicitly and hand focus back. Tracking the committed
	// value keeps the blur-triggered `change` from renaming a second time.
	let committedTitle = $derived(controller.title);

	function commitTitle(input: HTMLInputElement) {
		if (input.value === committedTitle) return;
		committedTitle = input.value;
		controller.setTitle(input.value);
	}

	// Same slot, same tier, label following the state — as with `Paste lyrics`.
	// The confirmation is the button itself, so nothing else has to appear to say
	// the copy landed; it reverts on its own because there is no other way out.
	let copied = $state(false);
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	/**
	 * The one copy that is worth interrupting: the next thing the user does with
	 * these lyrics is fill in a Genius song page, and the workbench already knows
	 * several of the fields on it — the facts the catalogue read that named the
	 * song paid for. Handing them over at the moment the lyrics leave saves the
	 * trip to the tools tab to copy them out one at a time.
	 *
	 * So the receipt draws only where there is something on it besides the word
	 * "copied", which the button already says in its own slot. A modal for nothing
	 * but a confirmation is a surface that opens itself to repeat a press.
	 */
	const songFacts = $derived(controller.media?.player.songDetails);
	const hasReceipt = $derived(hasSongFacts(songFacts, true));
	let receipt = $state<HTMLDialogElement>();

	async function copyLyrics() {
		const landed = await controller.copyCanonical();
		if (landed && hasReceipt) {
			receipt?.showModal();
			return;
		}
		copied = landed;
		clearTimeout(copiedTimer);
		if (copied) copiedTimer = setTimeout(() => (copied = false), 2000);
	}

	// A press on the backdrop is a press outside the surface, which is one of the
	// three ways every transient surface here closes.
	function dismissOnBackdrop(event: MouseEvent): void {
		if (event.target === receipt) receipt.close();
	}

	onMount(() => () => clearTimeout(copiedTimer));

	function onTitleClick(event: MouseEvent & { currentTarget: HTMLInputElement }) {
		// The constant, not the words: this is a real comparison rather than a
		// label, so a literal here stops matching the day the placeholder is
		// renamed and the select-all quietly never fires again.
		if (event.currentTarget.value === DEFAULT_DRAFT_TITLE) {
			event.currentTarget.select();
		}
	}

	function onTitleKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commitTitle(event.currentTarget);
			event.currentTarget.blur();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.currentTarget.value = committedTitle;
			titleLength = committedTitle.length;
			event.currentTarget.blur();
		}
	}
</script>

<header class="document-toolbar" aria-label="Document controls">
	<!-- Left to right: who made this, what this document is called, and whether it
	     is safe on disk. The brand, the name, and the save state read as one
	     identity strip; everything that acts on the document lives on the right. -->
	<div class="document-toolbar__identity">
		<a class="document-toolbar__home" href={resolve('/')} aria-label="LyricLint home">
			<AppWordmark entrance="handoff" visible={brandRevealed} />
		</a>
		<!-- The name of the draft and the list of the other drafts are one control:
		     typing in it renames this document, and the chevron at its end opens the
		     ones it could be swapped for. The hamburger this replaced sat at the far
		     end of the command strip, named nothing, and was nowhere near the draft
		     it switched. -->
		<div class="draft-switcher">
			<label class="sr-only" for="draft-title">Draft title</label>
			<input
				id="draft-title"
				class="draft-title"
				size={titleSize}
				value={controller.title}
				oninput={(event) => (titleLength = event.currentTarget.value.length)}
				onchange={(event) => commitTitle(event.currentTarget)}
				onclick={onTitleClick}
				onkeydown={onTitleKeydown}
				aria-label="Draft title"
			/>
			<DraftMenu {controller} />
		</div>
		<!-- Starting a draft is the one command that acts on no document, so it sits
		     with the draft's own name rather than in the strip of commands that act
		     on this one — in the slot the save glyph used to hold. -->
		<button
			type="button"
			class="icon-button button--quiet new-draft-trigger"
			aria-label="New draft"
			title="New draft"
			onclick={() => controller.createDraft()}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				width="15"
				height="15"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
			>
				<path d="M8 2.5v11M2.5 8h11" />
			</svg>
		</button>
		<!-- Nothing is drawn while saving is going well: a disk glyph that is always
		     there reports a state that never changes, and the slot went to the plus.
		     The readout stays in the accessible tree throughout, and a failed save
		     is the one state that draws — with its words and an alert glyph, so the
		     state the user must act on is carried neither by red alone nor by the
		     silence that means everything is fine. -->
		<span
			class:failed={controller.saveStatus === 'failed'}
			class:sr-only={controller.saveStatus !== 'failed'}
			class="save-status"
			role="img"
			aria-label="Autosave status: {saveStatusText}"
			title={saveStatusText}
		>
			{#if controller.saveStatus === 'failed'}
				<svg
					class="save-status__icon"
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
					<path d="M8 2.4 15 13.6H1Z" />
					<path d="M8 6.7v3M8 11.6h.01" />
				</svg>
				Save failed
			{/if}
		</span>
	</div>

	<!-- The command strip holds only what acts on this document: its language,
	     then the contrast tier anchoring the right edge. Navigation left it for
	     the draft's own name, and creation left it for the same neighbourhood —
	     what remains here is the one action that bounds the session's work, last
	     in reading order and last in the tab order.

	     Which end of the work it bounds depends on whether there is any. On an
	     empty document `Copy lyrics` is the loudest thing on the screen pointing
	     at the exit, so the slot holds `Paste lyrics` until the document has
	     something in it. Same slot, same tier, label following the state — the
	     surface never carries two contrast actions, and the user is never offered
	     the end of a job they have not started. -->
	<div class="document-toolbar__commands">
		<!-- The keystrokes already exist in the editor; these are the same two
		     commands for the pointer, and they act on the document, so they belong
		     in this strip rather than beside the draft's name. Quiet tier: they are
		     corrections, not the thing the surface is for. -->
		<button
			type="button"
			class="icon-button button--quiet document-toolbar__history"
			aria-label="Undo"
			title="Undo"
			disabled={!controller.snapshot.canUndo}
			onclick={() => controller.undo()}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				width="15"
				height="15"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M3 6.5h6.2a3.8 3.8 0 0 1 0 7.6H6.5" />
				<path d="M5.8 3.4 2.7 6.5l3.1 3.1" />
			</svg>
		</button>
		<button
			type="button"
			class="icon-button button--quiet document-toolbar__history"
			aria-label="Redo"
			title="Redo"
			disabled={!controller.snapshot.canRedo}
			onclick={() => controller.redo()}
		>
			<svg
				aria-hidden="true"
				viewBox="0 0 16 16"
				width="15"
				height="15"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M13 6.5H6.8a3.8 3.8 0 0 0 0 7.6h2.7" />
				<path d="M10.2 3.4l3.1 3.1-3.1 3.1" />
			</svg>
		</button>
		<LanguagePicker {controller} />
		{#if controller.isEmpty}
			<button
				type="button"
				class="button button--contrast"
				onclick={() => controller.pasteLyrics()}
			>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path
						d="M6.2 2.9H4.7a1.2 1.2 0 0 0-1.2 1.2v9.2a1.2 1.2 0 0 0 1.2 1.2h6.6a1.2 1.2 0 0 0 1.2-1.2V4.1a1.2 1.2 0 0 0-1.2-1.2H9.8"
					/>
					<rect x="6.2" y="1.5" width="3.6" height="2.6" rx="0.8" />
					<path d="M8 6.9v4.3M6.3 9.5 8 11.2l1.7-1.7" />
				</svg>
				Paste lyrics
			</button>
		{:else}
			<button type="button" class="button button--contrast" onclick={copyLyrics}>
				<svg
					aria-hidden="true"
					viewBox="0 0 16 16"
					width="14"
					height="14"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					{#if copied}
						<path d="M3 8.4 6.4 11.8 13 5.2" />
					{:else}
						<rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
						<path
							d="M10.5 3.5v-.8a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h.8"
						/>
					{/if}
				</svg>
				{copied ? 'Lyrics copied' : 'Copy lyrics'}
			</button>
		{/if}
	</div>
</header>

<!--
	What the copy landed with, where there is anything worth saying beyond that it
	landed: the song's own facts, in the forms the page being filled in wants them.

	Nothing here is boxed and nothing here contacts anyone — the facts arrived on
	the read that named the song. One action, because there is nothing to cancel;
	the dialog closes three ways and all of them mean the same. The list is
	`SongFacts.svelte`, shared with the tools panel, so a field added there appears
	here without anybody remembering to.
-->
<dialog
	bind:this={receipt}
	class="copy-receipt"
	aria-labelledby="copy-receipt-title"
	onclick={dismissOnBackdrop}
>
	<div class="copy-receipt__body">
		<!-- The mark says the copy landed, so the heading and the sentence under it
		     are free to say what to do with it. `aria-hidden`, because the heading
		     is already the words this draws. -->
		<svg
			class="copy-receipt__mark"
			aria-hidden="true"
			viewBox="0 0 32 32"
			width="44"
			height="44"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<circle cx="16" cy="16" r="14" />
			<path d="m9.5 16.6 4.4 4.4 9-9.4" />
		</svg>
		<h2 id="copy-receipt-title">Lyrics copied</h2>
		<p>Paste them into Genius. It also asks for these, which this song already told us.</p>
		<!-- The facts read down a left edge, so this is the one part of the receipt
		     that is not centred, and a hairline is what separates it from the message
		     above — a border around it would be a card inside the dialog. -->
		{#if songFacts}
			<div class="copy-receipt__facts">
				<SongFacts details={songFacts} genius />
			</div>
		{/if}
		<button
			type="button"
			class="button button--contrast copy-receipt__done"
			onclick={() => receipt?.close()}
		>
			Done
		</button>
	</div>
</dialog>

<style>
	.copy-receipt {
		width: min(30rem, calc(100vw - var(--space-4)));
		max-width: none;
		/* A long enough list has to be able to scroll rather than run under the one
		   control that closes the surface. */
		max-height: calc(100dvh - var(--space-6));
		padding: 0;
		overflow: auto;
		border: var(--border-width) solid var(--color-border-strong);
		border-radius: var(--radius-overlay);
		background: var(--color-overlay);
		color: var(--color-text);
		box-shadow: var(--shadow-overlay);
	}

	.copy-receipt::backdrop {
		background: var(--color-backdrop);
	}

	/* One column with one gap, rather than a margin on each child: the receipt is
	   a stack read top to bottom — mark, message, facts, way out — and margins are
	   what let the button and the last row of the list collide. */
	.copy-receipt__body {
		display: flex;
		flex-direction: column;
		padding: var(--space-5) var(--space-4) var(--space-4);
		gap: var(--space-3);
		text-align: center;
	}

	.copy-receipt__mark {
		align-self: center;
		color: var(--color-success);
	}

	.copy-receipt__body h2 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
	}

	.copy-receipt__body p {
		margin: 0;
		color: var(--color-text-muted);
	}

	.copy-receipt__facts {
		margin-top: var(--space-2);
		padding-top: var(--space-4);
		border-top: var(--border-width) solid var(--color-border);
		text-align: start;
	}

	/* A finger is what will press it, and it is the only control here. */
	.copy-receipt__done {
		margin-top: var(--space-2);
		min-height: var(--control-height-lg);
	}
</style>
