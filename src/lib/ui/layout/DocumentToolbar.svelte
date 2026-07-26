<script lang="ts">
	import { resolve } from '$app/paths';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { onMount } from 'svelte';
	import AppWordmark from './AppWordmark.svelte';
	import DraftMenu from './DraftMenu.svelte';
	import LanguagePicker from './LanguagePicker.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
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

	async function copyLyrics() {
		copied = await controller.copyCanonical();
		clearTimeout(copiedTimer);
		if (copied) copiedTimer = setTimeout(() => (copied = false), 2000);
	}

	onMount(() => () => clearTimeout(copiedTimer));

	function onTitleClick(event: MouseEvent & { currentTarget: HTMLInputElement }) {
		if (event.currentTarget.value === 'Untitled draft') {
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
			<AppWordmark />
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
