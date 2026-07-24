<script lang="ts">
	import type { PerformerRecord } from '$lib/core/types.js';
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { untrack } from 'svelte';

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

	function saveRename(event: SubmitEvent): void {
		event.preventDefault();
		controller.renamePerformer(performer.id, name);
		editing = false;
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
			<input id={`performer-${performer.id}`} bind:value={name} />
			<button type="submit" class="button button--primary">Save</button>
			<button
				type="button"
				class="button button--quiet"
				onclick={() => {
					name = performer.displayName;
					editing = false;
				}}>Cancel</button
			>
		</form>
	{:else}
		<div class="performer-row__actions">
			<button
				type="button"
				class="button button--primary"
				onclick={() => controller.assignSelection([performer.id])}>Assign</button
			>
			<button type="button" class="button button--quiet" onclick={() => (editing = true)}>
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
				onclick={() => controller.removePerformer(performer.id)}>Remove</button
			>
		</div>
	{/if}
</li>
