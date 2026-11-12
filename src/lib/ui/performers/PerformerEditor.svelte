<script lang="ts">
	import type { PerformerRecord } from '#lib/core/types.js';
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
		// was when the row was first drawn, and a rename made inside a header
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
			<!-- One name control carries its visible rename affordance. -->
			{#if removing}
				<span class="list-row__name performer-row__name">{performer.displayName}</span>
			{:else}
				<button
					type="button"
					class="performer-row__name"
					aria-label="Rename {performer.displayName}"
					title="Rename"
					bind:this={renameButton}
					onclick={beginRename}
				>
					<span class="list-row__name">{performer.displayName}</span>
					<span class="performer-row__rename" aria-hidden="true">Rename</span>
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

<style>
	/* The row is `.list-row` (rows.css); this pulls its fill out to the panel's own
	   inset so the names still line up with the prose above them. */
	.performer-row {
		min-width: 0;
		margin-inline: calc(-1 * var(--space-2));
	}

	.performer-row__identity {
		display: flex;
		min-width: 0;
		gap: var(--space-3);
		flex: 1;
		align-items: center;
	}

	.performer-row__name {
		display: flex;
		min-width: 0;
		min-height: var(--control-height-sm);
		padding: 0;
		border: 0;
		gap: var(--space-3);
		flex: 1;
		align-items: center;
		justify-content: space-between;
		background: transparent;
		color: var(--color-text);
		text-align: start;
	}

	.performer-row__rename {
		flex: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	button.performer-row__name:hover .list-row__name {
		text-decoration: underline;
	}

	@media (pointer: coarse) {
		button.performer-row__name {
			min-height: var(--control-height-touch);
		}
	}

	.performer-color {
		width: 1rem;
		height: 1rem;
		flex: none;
		border: var(--border-width) solid color-mix(in oklch, currentColor 35%, var(--color-border));
		border-radius: var(--radius-round);
		background: var(--performer-color);
	}

	/* One modifier per `performerColorPalette` id (`performers/color.ts`); the
	   class is built from the performer's `colorId` in the markup above. */
	.performer-color--plum {
		--performer-color: var(--performer-plum);
	}

	.performer-color--ochre {
		--performer-color: var(--performer-ochre);
	}

	.performer-color--teal {
		--performer-color: var(--performer-teal);
	}

	.performer-color--rose {
		--performer-color: var(--performer-rose);
	}

	.performer-color--indigo {
		--performer-color: var(--performer-indigo);
	}

	.performer-color--olive {
		--performer-color: var(--performer-olive);
	}

	.performer-color--copper {
		--performer-color: var(--performer-copper);
	}

	.performer-color--slate {
		--performer-color: var(--performer-slate);
	}
</style>
