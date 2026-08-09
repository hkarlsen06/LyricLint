<script lang="ts">
	import { Trash2 } from 'lucide-svelte';
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
	 * rows — the drafts menu, the linter panel's recent drafts, the performer
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
	// focus across the swap — otherwise a keyboard user is dropped on the body
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
	<button
		type="button"
		class="button button--danger remove-button__confirm"
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
		<Trash2 aria-hidden="true" size={14} strokeWidth={2.25} />
	</button>
{/if}
