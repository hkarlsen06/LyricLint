<script lang="ts">
	import type { WorkbenchController } from '../state/workbench.svelte.js';
	import { dismissOnOutside } from '$lib/interaction/dismiss.js';
	import { tick } from 'svelte';

	let { controller, open = $bindable(false) }: { controller: WorkbenchController; open?: boolean } =
		$props();

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

	/** Close the popover for actions that switch the active document. */
	function closeAnd(action: () => Promise<void>): Promise<void> {
		open = false;
		return action();
	}

	// A press outside the menu closes it. The attachment sits on the `<details>`,
	// so a press on the summary is inside and the native toggle still owns it.
	// Leaving the menu abandons any pending confirm too — reopening it must not
	// present a primed "Delete all" the user has already walked away from.
	function dismiss(): void {
		if (!open) {
			return;
		}
		open = false;
		renameId = undefined;
		deleteId = undefined;
		confirmDeleteAll = false;
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

<details class="draft-menu" bind:open {@attach dismissOnOutside(dismiss)}>
	<!-- The .button flex styling strips the summary's implicit disclosure role in
	     Chromium, so restate the button semantics and expansion state explicitly.
	     Svelte considers the role redundant, but real browsers expose the styled
	     summary as generic without it. -->
	<!-- svelte-ignore a11y_no_redundant_roles -->
	<!-- Icon only: the three-line menu glyph is the whole control, so its name
	     lives in the accessible name and the native tooltip instead. -->
	<summary
		class="button button--quiet icon-button draft-menu__trigger"
		role="button"
		aria-label="Drafts"
		title="Drafts"
		aria-expanded={open}
		bind:this={menuTrigger}
	>
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			width="15"
			height="15"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
		>
			<path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
		</svg>
	</summary>
	<div class="draft-menu__popover">
		<h2 class="draft-menu__heading">Saved drafts</h2>

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
								<button class="button button--contrast" type="submit">Save</button>
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
								onclick={() => closeAnd(() => controller.openDraft(draft.id))}
							>
								<span>{draft.title}</span>
								<time datetime={draft.updatedAt}
									>{new Date(draft.updatedAt).toLocaleDateString()}</time
								>
							</button>
							<!-- While a delete is pending the row's other actions step aside, so the
							     confirm is the only decision on screen. -->
							<div class="draft-list__actions">
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
