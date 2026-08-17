<script lang="ts">
	import type { PerformerRecord } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import RemoveButton from '../primitives/RemoveButton.svelte';
	import { tick, untrack } from 'svelte';

	let {
		performer,
		controller,
		removing,
		onRequestRemove,
		onCancelRemove
	}: {
		performer: PerformerRecord;
		controller: WorkbenchController;
		/** Whether this row is the one armed for removal; the roster owns it. */
		removing: boolean;
		onRequestRemove: () => void;
		onCancelRemove: () => void;
	} = $props();

	let editing = $state(false);
	let name = $state(untrack(() => performer.displayName));
	let renameInput = $state<HTMLInputElement>();
	let renameButton = $state<HTMLButtonElement>();

	async function beginRename(): Promise<void> {
		// Seeded at mount and never again, this field opened on whatever the name
		// was when the row was first drawn — and a rename made inside a header
		// reaches the roster through `adoptHeaderRename` without this instance
		// going anywhere. The row said KrissyC, the field said KrissyB, and one
		// Enter wrote every header back. The field is the row's name at the moment
		// it opens, not at the moment it was built.
		name = performer.displayName;
		// Two questions about one row is one too many.
		onCancelRemove();
		editing = true;
		await tick();
		renameInput?.focus();
		renameInput?.select();
	}

	async function finishRename(): Promise<void> {
		editing = false;
		await tick();
		renameButton?.focus();
	}

	async function saveRename(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		controller.renamePerformer(performer.id, name);
		await finishRename();
	}

	async function cancelRename(): Promise<void> {
		name = performer.displayName;
		await finishRename();
	}

	async function removeAndMoveFocus(trigger: HTMLButtonElement): Promise<void> {
		const roster = trigger.closest('.performer-roster');
		const nextRowControl = trigger
			.closest('li')
			?.nextElementSibling?.querySelector<HTMLButtonElement>('button');
		const fallback = roster?.querySelector<HTMLInputElement>('#new-performer');
		controller.removePerformer(performer.id);
		onCancelRemove();
		await tick();
		if (nextRowControl?.isConnected) {
			nextRowControl.focus();
		} else {
			fallback?.focus();
		}
	}
</script>

<li class="list-row performer-row">
	{#if editing}
		<form class="list-row__form" onsubmit={saveRename}>
			<label class="sr-only" for={`performer-${performer.id}`}>Performer name</label>
			<input id={`performer-${performer.id}`} bind:this={renameInput} bind:value={name} />
			<button type="submit" class="button button--contrast">Save</button>
			<button type="button" class="button button--quiet" onclick={cancelRename}>Cancel</button>
		</form>
	{:else}
		<span class="performer-row__identity">
			<!-- The color is a visual distinguisher only, so the dot is decorative. -->
			<span class={`performer-color performer-color--${performer.colorId}`} aria-hidden="true"
			></span>
			<!-- The name is the rename. A pencil beside it was a second control for
			     the thing the user is already pointing at, so pressing the name opens
			     the field in its place — and while a removal is pending it is text
			     again, because that question is the row's only one.

			     A name, not an emphasis: six bold rows in a column were the same
			     repetition the spelled-out commands were. -->
			{#if removing}
				<span class="list-row__name performer-row__name">{performer.displayName}</span>
			{:else}
				<button
					type="button"
					class="list-row__name performer-row__name"
					aria-label="Rename {performer.displayName}"
					title="Rename"
					bind:this={renameButton}
					onclick={beginRename}
				>
					{performer.displayName}
				</button>
			{/if}
		</span>

		<div class="list-row__commands">
			<RemoveButton
				subject={performer.displayName}
				label="Remove"
				pending={removing}
				onRequest={onRequestRemove}
				onCancel={onCancelRemove}
				onConfirm={(trigger) => removeAndMoveFocus(trigger)}
			/>
		</div>
	{/if}
</li>
