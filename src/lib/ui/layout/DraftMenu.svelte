<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { tick } from 'svelte';

	let { controller }: { controller: WorkbenchController } = $props();

	let renameId = $state<string | undefined>();
	let renameValue = $state('');
	let deleteId = $state<string | undefined>();
	let confirmDeleteAll = $state(false);
	let menuTrigger: HTMLElement;

	function beginRename(id: string, title: string): void {
		renameId = id;
		renameValue = title;
	}

	async function submitRename(event: SubmitEvent, id: string): Promise<void> {
		event.preventDefault();
		await controller.renameDraft(id, renameValue);
		renameId = undefined;
	}

	async function deleteDraftAndMoveFocus(id: string, trigger: HTMLButtonElement): Promise<void> {
		const nextDraft = trigger
			.closest('li')
			?.nextElementSibling?.querySelector<HTMLButtonElement>('.draft-list__title');
		await controller.deleteDraft(id);
		deleteId = undefined;
		await tick();
		if (nextDraft?.isConnected) {
			nextDraft.focus();
		} else {
			menuTrigger.focus();
		}
	}
</script>

<details class="draft-menu">
	<summary class="button button--quiet" bind:this={menuTrigger}>Drafts</summary>
	<div class="draft-menu__popover">
		<div class="draft-menu__heading">
			<strong>Saved drafts</strong>
			<button type="button" class="button button--primary" onclick={() => controller.createDraft()}>
				New draft
			</button>
		</div>

		{#if controller.drafts.length === 0}
			<p class="empty-state">
				No saved drafts yet. This draft will appear after its first local save.
			</p>
		{:else}
			<ul class="draft-list">
				{#each controller.drafts as draft (draft.id)}
					<li class:current={draft.id === controller.draftId}>
						{#if renameId === draft.id}
							<form class="inline-form" onsubmit={(event) => submitRename(event, draft.id)}>
								<label class="sr-only" for={`rename-${draft.id}`}>Draft title</label>
								<input id={`rename-${draft.id}`} bind:value={renameValue} />
								<button class="button button--primary" type="submit">Save</button>
								<button
									class="button button--quiet"
									type="button"
									onclick={() => (renameId = undefined)}
								>
									Cancel
								</button>
							</form>
						{:else}
							<button
								type="button"
								class="draft-list__title"
								aria-current={draft.id === controller.draftId ? 'page' : undefined}
								onclick={() => controller.openDraft(draft.id)}
							>
								<span>{draft.title}</span>
								<time datetime={draft.updatedAt}
									>{new Date(draft.updatedAt).toLocaleDateString()}</time
								>
							</button>
							<div class="draft-list__actions">
								<button
									type="button"
									class="button button--quiet"
									onclick={() => beginRename(draft.id, draft.title)}>Rename</button
								>
								<button
									type="button"
									class="button button--quiet"
									onclick={() => controller.duplicateDraft(draft.id)}>Duplicate</button
								>
								<button
									type="button"
									class="button button--quiet"
									onclick={() => controller.exportDraft(draft.id)}>Export</button
								>
								{#if deleteId === draft.id}
									<span class="confirm-row">
										Delete?
										<button
											type="button"
											class="button button--danger"
											onclick={(event) => deleteDraftAndMoveFocus(draft.id, event.currentTarget)}
											>Yes</button
										>
										<button
											type="button"
											class="button button--quiet"
											onclick={() => (deleteId = undefined)}>No</button
										>
									</span>
								{:else}
									<button
										type="button"
										class="button button--quiet danger-text"
										onclick={() => (deleteId = draft.id)}>Delete</button
									>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<div class="draft-menu__footer">
			{#if confirmDeleteAll}
				<span>Delete every local draft?</span>
				<button
					type="button"
					class="button button--danger"
					onclick={async () => {
						await controller.deleteAllDrafts();
						confirmDeleteAll = false;
					}}>Delete all</button
				>
				<button
					type="button"
					class="button button--quiet"
					onclick={() => (confirmDeleteAll = false)}>Cancel</button
				>
			{:else}
				<button
					type="button"
					class="button button--quiet danger-text"
					onclick={() => (confirmDeleteAll = true)}>Delete all local data…</button
				>
			{/if}
		</div>
	</div>
</details>
