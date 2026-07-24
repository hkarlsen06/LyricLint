<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import PerformerEditor from './PerformerEditor.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
	let newName = $state('');

	function add(event: SubmitEvent): void {
		event.preventDefault();
		controller.addPerformer(newName);
		newName = '';
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
		<ul class="performer-list" aria-label="Draft performer roster">
			{#each controller.performers as performer, index (performer.id)}
				<PerformerEditor {performer} {index} count={controller.performers.length} {controller} />
			{/each}
		</ul>
	{/if}
</section>
