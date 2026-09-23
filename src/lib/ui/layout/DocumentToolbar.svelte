<script lang="ts">
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import ClipboardTextIcon from 'phosphor-svelte/lib/ClipboardTextIcon';
	import CopyIcon from 'phosphor-svelte/lib/CopyIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import ArrowClockwiseIcon from 'phosphor-svelte/lib/ArrowClockwiseIcon';
	import WarningIcon from 'phosphor-svelte/lib/WarningIcon';
	import ArrowCounterClockwiseIcon from 'phosphor-svelte/lib/ArrowCounterClockwiseIcon';
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

	// Same slot, same tier, label following the state, as with `Paste lyrics`.
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
			     markup that nothing ever read. Two mechanisms for one name is one of
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
		     on this one, in the slot the save glyph used to hold. -->
		{#if !phone.current}
			<button
				type="button"
				class="icon-button button--quiet new-draft-trigger"
				aria-label="New 'scribe"
				title="New 'scribe"
				onclick={() => controller.createDraft()}
			>
				<PlusIcon aria-hidden="true" size={16} weight="bold" />
			</button>
		{/if}
		<!-- Nothing is drawn while saving is going well: a disk glyph that is always
		     there reports a state that never changes, and the slot went to the plus.
		     The readout stays in the accessible tree throughout, and a failed save
		     is the one state that draws, with its words and an alert glyph, so the
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
				<WarningIcon class="save-status__icon" aria-hidden="true" size={13} weight="bold" />
				Save failed
			{/if}
		</span>
	</div>

	<!-- The command strip holds only what acts on this document: its language,
	     then the contrast tier anchoring the right edge. Navigation left it for
	     the draft's own name, and creation left it for the same neighbourhood.
	     What remains here is the one action that bounds the session's work, last
	     in reading order and last in the tab order.

	     Which end of the work it bounds depends on whether there is any. On an
	     empty document `Copy lyrics` is the loudest thing on the screen pointing
	     at the exit, so the slot holds `Paste lyrics` until the document has
	     something in it. Same slot, same tier, label following the state, so the
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
						<PlusIcon aria-hidden="true" size={16} weight="bold" />
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
					<ArrowCounterClockwiseIcon aria-hidden="true" size={16} weight="bold" />
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
					<ArrowClockwiseIcon aria-hidden="true" size={16} weight="bold" />
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
				<ClipboardTextIcon aria-hidden="true" size={16} weight="bold" />
				Paste lyrics
			</button>
		{:else}
			<button type="button" class="button button--contrast" onclick={copyLyrics}>
				{#if copied}
					<CheckIcon aria-hidden="true" size={16} weight="bold" />
				{:else}
					<CopyIcon aria-hidden="true" size={16} weight="bold" />
				{/if}
				{copied ? 'Lyrics copied' : 'Copy lyrics'}
			</button>
		{/if}
	</div>
</header>

<style>
	/* The full width of the window, above both columns. */
	.document-toolbar {
		z-index: var(--layer-toolbar);
		display: flex;
		min-height: var(--header-height);
		grid-row: 1;
		grid-column: 1 / -1;
		padding: var(--space-2-5) var(--space-4);
		border-bottom: 0;
		gap: var(--space-3);
		align-items: center;
		justify-content: space-between;
		background: var(--color-chrome);
	}

	.document-toolbar__identity,
	.document-toolbar__commands {
		display: flex;
		min-width: 0;
		gap: var(--space-2);
		align-items: center;
	}

	/* The identity strip absorbs the slack so the commands stay pinned right. Its
	   own gap is tighter than the toolbar's so the plus reads as belonging to the
	   draft's name rather than as a third, separate item. */
	.document-toolbar__identity {
		flex: 1 1 auto;
		gap: var(--space-1);
	}

	.document-toolbar__commands {
		flex: none;
	}

	/* The destination action keeps a permanent surface; the shared button tiers own
	   hover/focus. */
	.document-toolbar__commands > .button {
		white-space: nowrap;
	}

	.document-toolbar__commands > .button > :global(svg) {
		flex: none;
	}

	/* Undo and redo are one pair, not two items in the strip, so they sit against
	   each other rather than at the gap that separates commands from one another. */
	.document-toolbar__history + .document-toolbar__history {
		margin-left: calc(-1 * var(--space-2));
	}

	/* The brand is the way back to the marketing home. The link draws no extra
	   surface, so the lockup keeps exactly the same geometry it had when it was
	   inert. It buys a little extra room before the adjacent bold draft name so the
	   two do not read as one phrase. */
	.document-toolbar__home {
		display: inline-flex;
		margin-inline-end: var(--space-2);
		color: inherit;
		text-decoration: none;
	}

	/* The draft's name and the way into the other drafts are one control, so they
	   share one surface: the border and fill are drawn on the group, and hovering
	   either half (or opening the menu) lights the whole thing rather than the
	   half the pointer happens to be over. It is also what the popover hangs from,
	   so the list of drafts opens under the name it would replace. */
	.draft-switcher {
		position: relative;
		display: flex;
		border: var(--border-width) solid transparent;
		border-radius: var(--radius-control);
		align-items: center;
	}

	.draft-switcher:hover,
	.draft-switcher:focus-within,
	.draft-switcher:has(:global(.draft-menu[open])) {
		background: var(--color-surface);
		box-shadow: var(--shadow-control);
	}

	/* Hugs its own text so the save status sits right beside the title instead of
	   being pushed out by a fixed-width field. `size` covers browsers without
	   `field-sizing`. It sits below the wordmark's weight so the brand and the
	   document name stay distinguishable side by side. The field draws no box
	   of its own at any point: a border inside the group's border is two rectangles
	   for one control. */
	.draft-title {
		text-overflow: ellipsis;
		width: auto;
		min-width: 4rem;
		max-width: min(34rem, 42vw);
		border-color: transparent;
		background: transparent;
		box-shadow: none;
		field-sizing: content;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
	}

	/* The workbench's coarse-pointer field floor (`.workspace input` in
	   `responsive.css`) outranked the title's own size while both were global;
	   scoped, the title would win, so the floor is restated for it. */
	@media (pointer: coarse) {
		:global(.workspace) .draft-title {
			font-size: var(--font-size-lg);
		}
	}

	/* The healthy states draw nothing at all (the readout is `sr-only` until it has
	   something to report), so everything here is for the failed state. */
	.save-status {
		display: inline-flex;
		gap: var(--space-1-5);
		align-items: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		white-space: nowrap;
	}

	.save-status :global(.save-status__icon) {
		flex: none;
	}

	.save-status.failed {
		color: var(--color-danger);
		font-weight: var(--font-weight-semibold);
	}

	/* The toolbar scrolls sideways rather than wrapping, for the reason the transport
	   strip does: wrapped, it became a two-line band across the top of the window,
	   which is a second header's worth of chrome taken off the document for a row
	   whose contents never grew. Both groups stop absorbing slack (a growing
	   identity strip has nothing to push the commands against once the row is wider
	   than the window), and the bar is hidden, like the strip's, so a permanent grey
	   rule is not drawn under the toolbar at every narrow width. */
	@media (max-width: 78rem) {
		.document-toolbar {
			overflow-x: auto;
			scrollbar-width: none;
		}

		.document-toolbar__identity,
		.document-toolbar__commands {
			flex: none;
		}
	}

	@media (pointer: fine) and (max-width: 46rem) {
		/* Identity and commands get their own row before either can be clipped.
		   Labels stay visible; very narrow windows wrap the command row. */
		.document-toolbar {
			flex-wrap: wrap;
			padding: var(--space-2);
			gap: var(--space-2);
		}

		.document-toolbar__identity,
		.document-toolbar__commands {
			flex: 1 1 100%;
		}

		.document-toolbar__identity {
			flex-wrap: wrap;
		}

		.document-toolbar__home,
		.new-draft-trigger {
			flex: none;
		}

		.draft-switcher {
			flex: 1;
			min-width: 0;
		}

		.draft-switcher .draft-title {
			width: 100%;
			min-width: 0;
			max-width: none;
		}

		.document-toolbar__commands {
			flex-wrap: wrap;
			justify-content: flex-end;
			gap: var(--space-1);
		}

		.document-toolbar__commands > .button {
			padding-inline: var(--space-2);
			font-size: var(--font-size-sm);
		}

		/* The words already name these actions. Keep the history glyphs, which
		   have no visible text, and spend the remaining width on full labels. */
		.document-toolbar__commands > .button > :global(svg) {
			display: none;
		}

		.document-toolbar__history + .document-toolbar__history {
			margin-left: calc(-1 * var(--space-1));
		}

		.draft-title {
			max-width: min(15rem, 60vw);
		}
	}

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
