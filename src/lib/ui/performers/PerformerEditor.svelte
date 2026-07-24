<script lang="ts">
	import type { PerformerRecord } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { tick, untrack } from 'svelte';

	let {
		performer,
		index,
		count,
		controller
	}: {
		performer: PerformerRecord;
		index: number;
		count: number;
		controller: WorkbenchController;
	} = $props();

	let editing = $state(false);
	let name = $state(untrack(() => performer.displayName));
	let renameInput = $state<HTMLInputElement>();
	let renameButton = $state<HTMLButtonElement>();

	async function beginRename(): Promise<void> {
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
		await tick();
		if (nextRowControl?.isConnected) {
			nextRowControl.focus();
		} else {
			fallback?.focus();
		}
	}
</script>

<li class="performer-row">
	<div class="performer-row__identity">
		<span
			class={`performer-color performer-color--${performer.colorId}`}
			aria-label={`${performer.colorId} color`}
		></span>
		<div>
			<strong>{performer.displayName}</strong>
			<span>Color: {performer.colorId}</span>
		</div>
	</div>

	{#if editing}
		<form class="inline-form" onsubmit={saveRename}>
			<label class="sr-only" for={`performer-${performer.id}`}>Performer name</label>
			<input id={`performer-${performer.id}`} bind:this={renameInput} bind:value={name} />
			<button type="submit" class="button button--primary">Save</button>
			<button
				type="button"
				class="button button--quiet"
				onclick={cancelRename}>Cancel</button
			>
		</form>
	{:else}
		<div class="performer-row__actions">
			<button
				type="button"
				class="button button--primary"
				onclick={() => controller.assignSelection([performer.id])}>Assign</button
			>
			<button
				type="button"
				class="button button--quiet"
				bind:this={renameButton}
				onclick={beginRename}
			>
				Rename
			</button>
			<button
				type="button"
				class="button button--quiet"
				onclick={() => controller.cyclePerformerColor(performer.id)}>Recolor</button
			>
			<button
				type="button"
				class="icon-button"
				aria-label={`Move ${performer.displayName} up`}
				disabled={index === 0}
				onclick={() => controller.movePerformer(performer.id, -1)}>↑</button
			>
			<button
				type="button"
				class="icon-button"
				aria-label={`Move ${performer.displayName} down`}
				disabled={index === count - 1}
				onclick={() => controller.movePerformer(performer.id, 1)}>↓</button
			>
			<button
				type="button"
				class="button button--quiet danger-text"
				onclick={(event) => removeAndMoveFocus(event.currentTarget)}>Remove</button
			>
		</div>
	{/if}
</li>
