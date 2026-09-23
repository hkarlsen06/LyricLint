<script lang="ts">
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
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
			>How to assign voices<CaretRightIcon
				class="performer-legend__chevron"
				aria-hidden="true"
				weight="bold"
			/></summary
		>
		<p class="roster-hint">
			Select lyric text, then choose Assign voices or press Ctrl+Alt+P. Pointer selections open the
			picker automatically on desktop.
		</p>
	</details>
</section>

<style>
	.performer-add {
		display: grid;
		margin-bottom: var(--space-4);
		gap: var(--space-2);
		font-weight: var(--font-weight-regular);
	}

	/* Assignment stays beside the lyrics; this is supporting guidance, not a divider. */
	.roster-hint {
		margin: 0 0 var(--space-3);
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.inline-form {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}

	.inline-form input {
		min-width: 8rem;
		flex: 1;
	}

	.performer-list {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.performer-add input {
		font-size: var(--font-size-editor);
		font-weight: var(--font-weight-regular);
	}

	.performer-help {
		margin-top: var(--space-3);
	}

	/* The same disclosure row as the legend's summary (`PerformerLegend.svelte`). */
	.performer-help > summary {
		display: flex;
		min-height: var(--control-height-lg);
		padding-block: var(--space-3);
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		list-style: none;
		cursor: pointer;
	}

	.performer-help > summary {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
	}

	.performer-help > summary::-webkit-details-marker {
		display: none;
	}

	.performer-help > summary:hover {
		text-decoration: underline;
		text-underline-offset: var(--space-1);
	}

	.performer-help[open] > summary :global(.performer-legend__chevron) {
		transform: rotate(90deg);
	}
</style>
