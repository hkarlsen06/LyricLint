<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { orderPerformersByAppearance } from '../state/wiring.js';
	import PerformerEditor from './PerformerEditor.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
	let newName = $state('');
	let selectedPerformerIds = $state<string[]>([]);

	// The roster lists performers in the order they first appear in the lyrics;
	// performers not (yet) in the document follow in the order they were added.
	const orderedPerformers = $derived(
		orderPerformersByAppearance(controller.snapshot.parsed, controller.performers)
	);

	function add(event: SubmitEvent): void {
		event.preventDefault();
		controller.addPerformer(newName);
		newName = '';
	}

	function toggleAssignment(id: string): void {
		selectedPerformerIds = selectedPerformerIds.includes(id)
			? selectedPerformerIds.filter((performerId) => performerId !== id)
			: [...selectedPerformerIds, id];
	}

	function applyAssignment(): void {
		if (selectedPerformerIds.length === 0) return;
		controller.assignSelection(selectedPerformerIds);
		selectedPerformerIds = [];
	}

	function cancelAssignment(): void {
		selectedPerformerIds = [];
		controller.feedback.announce('Performer assignment cancelled.');
		controller.editor.focus();
	}
</script>

<section class="performer-roster">
	<form class="performer-add" onsubmit={add}>
		<label for="new-performer">Add performer</label>
		<div class="inline-form">
			<input
				id="new-performer"
				bind:value={newName}
				autocomplete="off"
				placeholder="Exact credited name"
			/>
			<button type="submit" class="button button--primary">Add</button>
		</div>
	</form>

	{#if controller.performers.length === 0}
		<p class="empty-state">
			Add performers here, then assign them to the current editor selection.
		</p>
	{:else}
		<fieldset class="performer-assignment">
			<legend>Assign selection</legend>
			<p>Select one or more performers. Multiple selections create one joint voice group.</p>
			<div class="performer-assignment__choices">
				{#each orderedPerformers as performer (performer.id)}
					<label>
						<input
							type="checkbox"
							checked={selectedPerformerIds.includes(performer.id)}
							onchange={() => toggleAssignment(performer.id)}
						/>
						<span>{performer.displayName}</span>
					</label>
				{/each}
			</div>
			<div class="performer-assignment__actions">
				<button
					type="button"
					class="button button--primary"
					disabled={selectedPerformerIds.length === 0}
					onclick={applyAssignment}
				>
					Apply
				</button>
				<button type="button" class="button button--quiet" onclick={cancelAssignment}>
					Cancel
				</button>
			</div>
		</fieldset>
		<ul class="performer-list" aria-label="Draft performer roster">
			{#each orderedPerformers as performer (performer.id)}
				<PerformerEditor {performer} {controller} />
			{/each}
		</ul>
	{/if}
</section>
