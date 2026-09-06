<script lang="ts">
	import Check from 'lucide-svelte/icons/check';
	import ClipboardPaste from 'lucide-svelte/icons/clipboard-paste';
	import Copy from 'lucide-svelte/icons/copy';
	import Plus from 'lucide-svelte/icons/plus';
	import Redo from 'lucide-svelte/icons/redo';
	import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
	import Undo from 'lucide-svelte/icons/undo';
	import { resolve } from '$app/paths';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { PHONE_WORKSPACE_QUERY } from '../state/phone-layout.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import AppWordmark from './AppWordmark.svelte';
	import CompareDialog from './CompareDialog.svelte';
	import DraftMenu from './DraftMenu.svelte';
	import LanguagePicker from './LanguagePicker.svelte';
	import { DEFAULT_DRAFT_TITLE } from '$lib/persistence/draft-repository.js';

	let {
		controller,
		brandRevealed = true
	}: {
		controller: WorkbenchController;
		brandRevealed?: boolean;
	} = $props();
	const phone = new MediaQuery(PHONE_WORKSPACE_QUERY);
	let commandsOpen = $state(false);
	let commandsTrigger = $state<HTMLButtonElement>();

	function closeCommands(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !commandsOpen || event.defaultPrevented) return;
		if (event.target instanceof Element && event.target.closest('dialog[open]')) return;
		event.preventDefault();
		commandsOpen = false;
		commandsTrigger?.focus();
	}

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
				return "Local 'scribe";
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

<svelte:window onkeydown={closeCommands} />

<header
	class:document-toolbar--phone={phone.current}
	class="document-toolbar"
	aria-label="Document controls"
>
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
			<!-- The `<label for>` is the whole of the name. It carried an identical
			     `aria-label` beside it, which outranks the element and made the label
			     markup that nothing ever read — two mechanisms for one name is one of
			     them free to drift. The label is the one kept, because it is what
			     every other field in the workbench uses. -->
			<label class="sr-only" for="draft-title">'Scribe title</label>
			<input
				id="draft-title"
				class="draft-title"
				size={titleSize}
				value={controller.title}
				oninput={(event) => (titleLength = event.currentTarget.value.length)}
				onchange={(event) => commitTitle(event.currentTarget)}
				onclick={onTitleClick}
				onkeydown={onTitleKeydown}
			/>
			<DraftMenu {controller} />
		</div>
		<!-- Starting a draft is the one command that acts on no document, so it sits
		     with the draft's own name rather than in the strip of commands that act
		     on this one — in the slot the save glyph used to hold. -->
		{#if !phone.current}
			<button
				type="button"
				class="icon-button button--quiet new-draft-trigger"
				aria-label="New 'scribe"
				title="New 'scribe"
				onclick={() => controller.createDraft()}
			>
				<Plus aria-hidden="true" size={16} strokeWidth={2} />
			</button>
		{/if}
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
				<TriangleAlert class="save-status__icon" aria-hidden="true" size={13} strokeWidth={2.25} />
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
		<div
			class="document-toolbar__secondary"
			class:document-toolbar__secondary--phone={phone.current}
			{@attach dismissOnOutside(() => (commandsOpen = false))}
		>
			{#if phone.current}
				<button
					bind:this={commandsTrigger}
					type="button"
					class="button button--quiet"
					aria-expanded={commandsOpen}
					aria-controls="document-commands"
					onclick={() => (commandsOpen = !commandsOpen)}>Document</button
				>
			{/if}
			<div
				id="document-commands"
				class="document-toolbar__secondary-actions"
				hidden={phone.current && !commandsOpen}
			>
				{#if phone.current}
					<button
						type="button"
						class="button button--quiet new-draft-trigger"
						aria-label="New 'scribe"
						title="New 'scribe"
						onclick={() => controller.createDraft()}
					>
						<Plus aria-hidden="true" size={16} strokeWidth={2} />
						New 'scribe
					</button>
				{/if}
				<!-- The keystrokes already exist in the editor; these are the same two
		     commands for the pointer, and they act on the document, so they belong
		     in this strip rather than beside the draft's name. Quiet tier: they are
		     corrections, not the thing the surface is for. -->
				<button
					type="button"
					class="{phone.current ? 'button' : 'icon-button'} button--quiet document-toolbar__history"
					aria-label="Undo"
					title="Undo"
					disabled={!controller.snapshot.canUndo}
					onclick={() => controller.undo()}
				>
					<Undo aria-hidden="true" size={16} strokeWidth={2} />
					{#if phone.current}Undo{/if}
				</button>
				<button
					type="button"
					class="{phone.current ? 'button' : 'icon-button'} button--quiet document-toolbar__history"
					aria-label="Redo"
					title="Redo"
					disabled={!controller.snapshot.canRedo}
					onclick={() => controller.redo()}
				>
					<Redo aria-hidden="true" size={16} strokeWidth={2} />
					{#if phone.current}Redo{/if}
				</button>
				<LanguagePicker {controller} expandedLabel={phone.current} />
				<!-- Reviewing what the copy will change on the page is the step before
		     copying it, so it sits beside the action it precedes. The component
		     gates itself on the document being empty. -->
				<CompareDialog {controller} />
			</div>
		</div>
		{#if controller.isEmpty}
			<button
				type="button"
				class="button button--contrast"
				onclick={() => controller.pasteLyrics()}
			>
				<ClipboardPaste aria-hidden="true" size={16} strokeWidth={2} />
				Paste lyrics
			</button>
		{:else}
			<button type="button" class="button button--contrast" onclick={copyLyrics}>
				{#if copied}
					<Check aria-hidden="true" size={16} strokeWidth={2} />
				{:else}
					<Copy aria-hidden="true" size={16} strokeWidth={2} />
				{/if}
				{copied ? 'Lyrics copied' : 'Copy lyrics'}
			</button>
		{/if}
	</div>
</header>

<style>
	.document-toolbar__secondary-actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.document-toolbar__secondary-actions :global(.button--quiet:not(:disabled)) {
		color: var(--color-text-muted);
	}
	.document-toolbar__secondary-actions :global(.button--quiet:hover:not(:disabled)),
	.document-toolbar__secondary-actions :global(.button--quiet:focus-visible) {
		color: var(--color-text);
	}
	.document-toolbar__secondary-actions :global(.button) {
		white-space: nowrap;
	}
	.document-toolbar__secondary-actions[hidden] {
		display: none;
	}
	.document-toolbar__secondary--phone {
		position: static;
	}
	.document-toolbar__secondary--phone .document-toolbar__secondary-actions {
		position: absolute;
		inset-block-start: 100%;
		inset-inline-end: var(--space-2);
		z-index: var(--layer-popover);
		width: max-content;
		min-width: calc(4 * var(--control-height-touch));
		max-width: calc(100% - 2 * var(--space-2));
		gap: 0;
		padding: var(--space-2);
		background: var(--color-overlay);
		border-radius: var(--radius-overlay);
		box-shadow: var(--shadow-popover);
		flex-direction: column;
		align-items: stretch;
	}
	.document-toolbar--phone {
		position: relative;
		z-index: var(--layer-menu);
		overflow: visible;
		flex-wrap: nowrap;
		padding: var(--space-1);
		gap: var(--space-1);
	}
	.document-toolbar--phone .document-toolbar__identity {
		flex: 1 1 auto;
		overflow: visible;
	}
	.document-toolbar--phone .document-toolbar__home {
		display: none;
	}
	.document-toolbar--phone .document-toolbar__commands {
		flex: none;
		gap: var(--space-1);
	}
	.document-toolbar--phone .draft-switcher {
		flex: 1;
		min-width: 0;
	}
	.document-toolbar--phone .draft-title {
		width: 100%;
		min-width: 0;
		max-width: none;
		font-size: var(--font-size-editor);
	}
	.document-toolbar--phone :global(button),
	.document-toolbar--phone :global(summary),
	.document-toolbar--phone input {
		min-height: var(--control-height-touch);
		min-width: var(--control-height-touch);
	}
	.document-toolbar--phone :global(.button) {
		padding-inline: var(--space-2);
		white-space: nowrap;
	}
	.document-toolbar--phone .document-toolbar__commands > .button :global(svg) {
		display: none;
	}
	.document-toolbar__secondary--phone .document-toolbar__secondary-actions > :global(button) {
		width: 100%;
		margin-inline: 0;
		justify-content: flex-start;
		text-align: start;
		white-space: normal;
	}
	.document-toolbar__secondary--phone .document-toolbar__secondary-actions > :global(button > svg) {
		flex: none;
	}
</style>
