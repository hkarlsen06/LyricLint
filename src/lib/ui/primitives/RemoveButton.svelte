<script lang="ts">
	import TrashIcon from 'phosphor-svelte/lib/TrashIcon';
	/**
	 * Taking a row out of a list, in one place, in two presses.
	 *
	 * The confirm takes over the trigger's own slot: the second press lands where
	 * the first one did, so the pointer never has to travel to a `Yes` that
	 * appeared somewhere else in the row. `Cancel` is the only thing beside it,
	 * and whichever surface renders this hides its competing actions while the
	 * confirm is pending, so exactly one decision is on screen.
	 *
	 * The pending row is the list's state rather than this component's: only one
	 * row may be armed at a time, and closing the surface has to abandon it.
	 *
	 * One implementation for every list that offers a way out of one of its
	 * rows: the drafts menu, the linter panel's recent drafts, the performer
	 * roster. `label` is the only thing that differs between them, because a
	 * draft is deleted and a performer is removed from a roster.
	 */
	interface Props {
		/** What this row is, for the accessible name; never rendered as text. */
		subject: string;
		/** The verb, and the whole of the confirm's visible label. */
		label?: string;
		pending: boolean;
		onRequest: () => void;
		onCancel: () => void;
		onConfirm: (trigger: HTMLButtonElement) => void;
	}

	let { subject, label = 'Delete', pending, onRequest, onCancel, onConfirm }: Props = $props();

	let confirmButton = $state<HTMLButtonElement | undefined>();

	// The confirm replaces the trigger, so the press that armed it has to carry
	// focus across the swap, or a keyboard user is dropped on the body
	// mid-decision.
	$effect(() => {
		if (pending) confirmButton?.focus();
	});
</script>

<!-- The pending state is a change of controls, not a status box: this is how it
     reaches anyone who cannot see the row change. -->
<span class="sr-only" aria-live="polite">
	{pending ? `${label} ${subject}? Confirm or cancel.` : ''}
</span>

{#if pending}
	<button
		type="button"
		class="button button--quiet remove-button__cancel"
		onclick={() => onCancel()}
	>
		Cancel
	</button>
	<!-- The visible label is the verb alone, because the row it sits in is the
	     subject. Focus lands here the moment the confirm is armed, though, and
	     what a screen reader then reads is the button's name on its own: a bare
	     "Delete" pointing at nothing. The subject rides the accessible name for
	     the same reason it rides the trigger's. -->
	<button
		type="button"
		class="button button--danger remove-button__confirm"
		aria-label="{label} {subject}"
		bind:this={confirmButton}
		onclick={(event) => onConfirm(event.currentTarget)}
	>
		{label}
	</button>
{:else}
	<button
		type="button"
		class="button--quiet icon-button remove-button"
		aria-label="{label} {subject}"
		title={label}
		onclick={() => onRequest()}
	>
		<TrashIcon aria-hidden="true" size={14} weight="bold" />
	</button>
{/if}

<style>
	/*
	 * The way out of a row, wherever a list offers one: the drafts menu, the linter
	 * panel's recent drafts, and the performer roster share this one control, so
	 * they share its look.
	 *
	 * The trigger is muted, not red. A list of seven rows drew seven red words down
	 * its right edge, which is a warning about nothing. The row is not dangerous,
	 * the press is. So the glyph earns its color under the pointer, and the fill is
	 * spent on the confirm that follows it.
	 *
	 * Every selector is element-qualified inside `:where()`, which lands it one
	 * element above the specificity it had as a global rule: it still outranks the
	 * shared `.button` and `.icon-button` tiers, and still yields to the
	 * root-qualified touch floors in `responsive-shared.css` and to the row's own
	 * focus quieting in `rows.css`, exactly as before.
	 */
	button:where(.remove-button, .remove-button__confirm, .remove-button__cancel) {
		min-height: var(--control-height-sm);
		padding-block: 0;
		font-size: var(--font-size-sm);
	}

	button:where(.remove-button) {
		width: 1.75rem;
		color: var(--color-text-muted);
	}

	/* Written to outrank the row's own quieting of the glyphs beside it. */
	button:where(.remove-button):hover:not(:disabled),
	button:where(.remove-button):focus-visible,
	:global(.list-row) button:where(.remove-button):hover:not(:disabled),
	:global(.list-row) button:where(.remove-button):focus-visible {
		color: var(--color-danger);
	}
</style>
