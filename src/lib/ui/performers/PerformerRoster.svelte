<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { orderPerformersByAppearance } from '../state/wiring.js';
	import PerformerEditor from './PerformerEditor.svelte';

	let { controller }: { controller: WorkbenchController } = $props();
	let newName = $state('');
	// One row at a time may be armed for removal, so the pending performer is the
	// list's state rather than each row's.
	let removingId = $state<string | undefined>();

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
			<button type="submit" class="button button--contrast">Add</button>
		</div>
	</form>

	{#if controller.performers.length === 0}
		<p class="empty-state">
			Add performers here, then select lyric text in the editor to assign them.
		</p>
	{:else}
		<p class="roster-hint">
			Select lyric text in the editor to assign performers to it.
		</p>
		<ul class="performer-list" aria-label="Draft performer roster">
			{#each orderedPerformers as performer (performer.id)}
				<PerformerEditor
					{performer}
					{controller}
					removing={removingId === performer.id}
					onRequestRemove={() => (removingId = performer.id)}
					onCancelRemove={() => (removingId = undefined)}
				/>
			{/each}
		</ul>
	{/if}
</section>
