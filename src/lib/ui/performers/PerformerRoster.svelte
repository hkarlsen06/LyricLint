<script lang="ts">
	import { ChevronRight } from 'lucide-svelte';
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
		<label class="sr-only" for="new-performer">Add performer</label>
		<div class="inline-form">
			<input
				id="new-performer"
				bind:value={newName}
				autocomplete="off"
				placeholder="Performer name"
			/>
			<button type="submit" class="button button--contrast" disabled={!newName.trim()}>Add</button>
		</div>
	</form>

	{#if controller.performers.length > 0}
		<ul class="performer-list" aria-label="'Scribe performer roster">
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
	<details class="performer-help">
		<summary
			>How to assign voices<ChevronRight
				class="performer-legend__chevron"
				aria-hidden="true"
			/></summary
		>
		<p class="roster-hint">
			Select lyric text, then choose Assign voices or press Ctrl+Alt+P. Pointer selections open the
			picker automatically on desktop.
		</p>
	</details>
</section>
